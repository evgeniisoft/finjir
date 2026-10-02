/**
 * ============================================
 * FinEngine 2026 - Ежемесячный cron
 * ============================================
 * GET /api/admin/cron/monthly
 *
 * Запускается Vercel Cron 1-го числа каждого месяца в 03:00 UTC.
 *
 * Действия:
 *   1. Генерация плана амортизации ОС на 12 месяцев вперёд.
 *   2. Генерация плана налогов на 12 месяцев вперёд.
 *   3. Логирование в AuditLogEntry.
 *
 * Защита: Authorization: Bearer <CRON_SECRET>.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { loadSystemAccounts } from '@/lib/config/accounts';
import { taxEngine } from '@/lib/engine/tax';
import { generateTaxPayments, GenerateResult } from '@/lib/engine/tax-scheduler';
import {
  generateDepreciationPayments,
} from '@/lib/engine/depreciation-scheduler';
import { getAllTaxPaymentDays } from '@/lib/utils/tax-payment-days';
import { dataCache, CACHE_PREFIXES } from '@/lib/cache';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ============================================
    // Проверка авторизации
    // ============================================
    const authHeader = request.headers.get('authorization') || '';
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET не задан в env' },
        { status: 500 },
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();

    // ============================================
    // Загрузка данных
    // ============================================
    const repo = getRepository();
    const [transactions, accounts, companies, settings, fixedAssets] =
      await Promise.all([
        repo.getAll('Transactions'),
        repo.getAll('Accounts'),
        repo.getAll('Companies'),
        repo.getAll('Settings'),
        repo.getAll('FixedAssets'),
      ]);

    loadSystemAccounts(settings);
    await taxEngine.loadSettings(settings);

    // ============================================
    // 1. Генерация плана амортизации
    // ============================================
    const activeAssets = fixedAssets.filter(
      (a: any) =>
        (a.status === 'active' || a.status === 'suspended') &&
        String(a.is_deleted || '') !== 'true',
    );

    const existingDepreciationHashes = transactions
      .filter((t: any) =>
        String(t.import_hash || '').startsWith('depreciation-'),
      )
      .map((t: any) => String(t.import_hash));

    const depreciationResult = generateDepreciationPayments(
      {
        start_year: currentYear,
        end_year: currentYear + 1,
        today,
      },
      {
        assets: activeAssets,
        existing_hashes: existingDepreciationHashes,
      },
    );

    let depreciationCreated = 0;
    if (depreciationResult.to_create.length > 0) {
      const now = new Date().toISOString();
      const toInsert = depreciationResult.to_create.map((spec) => ({
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

      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const r = await repo.batchCreate('Transactions', chunk);
        depreciationCreated += r.count || chunk.length;
      }
    }

    // ============================================
    // 2. Генерация плана налогов
    // ============================================
    const existingTaxes = transactions.filter((t: any) =>
      String(t.debit_account_id || '').startsWith('acc-tax-'),
    );

    const taxPaymentDays = getAllTaxPaymentDays(settings);
    const settingsMap: Record<string, any> = {};
    for (const s of settings) settingsMap[s.key] = s.value;
    const ipFixed = parseFloat(
      String(settingsMap['ip_fixed_contribution'] || '57390'),
    );

    const taxResult: GenerateResult = await generateTaxPayments(
      {
        start_year: currentYear,
        end_year: currentYear + 1,
        today,
        tax_payment_days: {
          vat: taxPaymentDays.vat,
          usn: taxPaymentDays.usn,
          profit: taxPaymentDays.profit,
          insurance: taxPaymentDays.insurance,
          ndfl: taxPaymentDays.ndfl,
          ip_fixed: taxPaymentDays.ip_fixed,
        },
        ip_fixed_contribution: ipFixed,
        credit_account_id: 'acc-bank-001',
      },
      {
        transactions,
        accounts,
        companies,
        existing_taxes: existingTaxes,
      },
    );

    let taxesCreated = 0;
    if (taxResult.to_create.length > 0) {
      const now = new Date().toISOString();
      const toInsert = taxResult.to_create.map((spec) => ({
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
        destination_account_id: 'acc-bank-001',
        is_deleted: '',
        created_at: now,
        updated_at: now,
      }));

      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const r = await repo.batchCreate('Transactions', chunk);
        taxesCreated += r.count || chunk.length;
      }
    }

    // ============================================
    // 3. Инвалидация кэша
    // ============================================
    dataCache.invalidate(CACHE_PREFIXES.DATA);
    dataCache.invalidate(CACHE_PREFIXES.REPORTS);
    dataCache.invalidate(CACHE_PREFIXES.BALANCE);

    // ============================================
    // 4. Логирование
    // ============================================
    const duration = Date.now() - startTime;

    try {
      await prisma.auditLogEntry.create({
        data: {
          id: crypto.randomUUID(),
          action: 'cron_monthly',
          entity: 'System',
          entity_id: '',
          changes: JSON.stringify({
            today,
            period: { from: currentYear, to: currentYear + 1 },
            assets_count: activeAssets.length,
            depreciation: {
              total: depreciationResult.summary.total,
              created: depreciationCreated,
              fact: depreciationResult.summary.fact,
              plan: depreciationResult.summary.plan,
            },
            taxes: {
              total: taxResult.summary.total,
              created: taxesCreated,
              fact: taxResult.summary.fact,
              plan: taxResult.summary.plan,
            },
            duration_ms: duration,
          }),
          timestamp: new Date(),
        },
      });
    } catch (logError) {
      console.error('Ошибка записи audit log:', logError);
      // не падаем
    }

    return NextResponse.json({
      success: true,
      today,
      period: { from: currentYear, to: currentYear + 1 },
      assets_count: activeAssets.length,
      depreciation: {
        summary: depreciationResult.summary,
        created: depreciationCreated,
      },
      taxes: {
        summary: taxResult.summary,
        created: taxesCreated,
      },
      duration_ms: duration,
    });
  } catch (error: any) {
    console.error('Ошибка cron monthly:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 },
    );
  }
}
