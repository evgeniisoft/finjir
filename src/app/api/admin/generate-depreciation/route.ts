/**
 * ============================================
 * API: Генерация транзакций по амортизации ОС
 * ============================================
 * POST /api/admin/generate-depreciation
 * Body: {
 *   apply: boolean,           // false = dry-run, true = создать
 *   start_year: number,       // 2026
 *   end_year: number,         // 2027
 *   company_id?: string,      // опционально — фильтр по компании
 * }
 *
 * Защита: owner / admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';
import {
  generateDepreciationPayments,
  GenerateResult,
} from '@/lib/engine/depreciation-scheduler';
import { dataCache, CACHE_PREFIXES } from '@/lib/cache';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const apply = Boolean(body.apply);
    const startYear = parseInt(body.start_year || '2026', 10);
    const endYear = parseInt(body.end_year || '2027', 10);
    const companyId = body.company_id || null;
    const today = new Date().toISOString().split('T')[0];

    if (startYear > endYear) {
      return NextResponse.json({ error: 'start_year > end_year' }, { status: 400 });
    }

    // ============================================
    // Загрузка данных
    // ============================================
    const repo = getRepository();
    const [fixedAssets, transactions] = await Promise.all([
      repo.getAll('FixedAssets'),
      repo.getAll('Transactions'),
    ]);

    // Фильтр по компании
    let assets = fixedAssets.filter((a: any) => a.status === 'active' || a.status === 'suspended' || a.status === 'disposed');
    if (companyId) {
      assets = assets.filter((a: any) => a.company_id === companyId);
    }

    // Существующие import_hash по амортизации
    const existingHashes = transactions
      .filter((t: any) => String(t.import_hash || '').startsWith('depreciation-'))
      .map((t: any) => String(t.import_hash));

    // ============================================
    // Генерация
    // ============================================
    const result: GenerateResult = generateDepreciationPayments(
      {
        start_year: startYear,
        end_year: endYear,
        today,
      },
      {
        assets,
        existing_hashes: existingHashes,
      },
    );

    // ============================================
    // Применение
    // ============================================
    let applied = 0;
    if (apply && result.to_create.length > 0) {
      const now = new Date().toISOString();
      const toInsert = result.to_create.map((spec) => ({
        tenant_id: 'tenant-1',
        company_id: spec.company_id,
        date: spec.date,
        description: spec.description,
        amount: spec.amount,
        amount_rub: spec.amount_rub,
        currency: 'RUB',
        type: spec.type,
        debit_account_id: spec.debit_account_id,
        credit_account_id: spec.credit_account_id,
        record_type: spec.record_type,
        source: spec.source,
        import_hash: spec.import_hash,
        counterparty_id: '',
        contract_id: '',
        transaction_group_id: '',
        is_system: false,
        external_id: '',
        accrual_date: spec.date,
        source_account_id: '',
        destination_account_id: '',
        is_deleted: '',
        created_at: now,
        updated_at: now,
      }));

      // Батчами по 50
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const r = await repo.batchCreate('Transactions', chunk);
        applied += r.count || chunk.length;
      }

      // Инвалидация кэша
      dataCache.invalidate(CACHE_PREFIXES.DATA);
      dataCache.invalidate(CACHE_PREFIXES.REPORTS);
    }

    return NextResponse.json({
      success: true,
      applied: apply,
      created: applied,
      today,
      period: { start_year: startYear, end_year: endYear },
      assets_count: assets.length,
      summary: result.summary,
      divergences: result.divergences,
      to_create_sample: result.to_create.slice(0, 10),
      to_skip_sample: result.to_skip.slice(0, 5),
    });
  } catch (error: any) {
    console.error('Ошибка API generate-depreciation:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message, stack: error.stack },
      { status: 500 },
    );
  }
}
