/**
 * ============================================
 * API: Основные средства (список + создание)
 * ============================================
 * GET  /api/fixed-assets?company_id=...&status=active
 * POST /api/fixed-assets
 *
 * Защита: owner / admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';
import { dataCache, CACHE_PREFIXES } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const url = new URL(request.url);
    const companyId = url.searchParams.get('company_id');
    const status = url.searchParams.get('status');

    const repo = getRepository();
    let assets = await repo.getAll('FixedAssets');

    // Фильтр: не удалённые
    assets = assets.filter(
      (a: any) => !a.is_deleted || a.is_deleted === '' || a.is_deleted === 'false',
    );

    if (companyId) {
      assets = assets.filter((a: any) => a.company_id === companyId);
    }
    if (status) {
      assets = assets.filter((a: any) => a.status === status);
    }

    // Сортировка по дате ввода (убывание)
    assets.sort((a: any, b: any) => {
      const da = String(a.commissioning_date || '');
      const db = String(b.commissioning_date || '');
      return db.localeCompare(da);
    });

    return NextResponse.json(assets);
  } catch (error: any) {
    console.error('Ошибка API fixed-assets GET:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const body = await request.json();

    // Валидация
    if (!body.name) {
      return NextResponse.json({ error: 'Не указано наименование' }, { status: 400 });
    }
    if (!body.company_id) {
      return NextResponse.json({ error: 'Не указана компания' }, { status: 400 });
    }
    if (!body.initial_cost || Number(body.initial_cost) <= 0) {
      return NextResponse.json({ error: 'Некорректная первоначальная стоимость' }, { status: 400 });
    }
    if (!body.commissioning_date) {
      return NextResponse.json({ error: 'Не указана дата ввода в эксплуатацию' }, { status: 400 });
    }
    if (!body.useful_life_months || Number(body.useful_life_months) <= 0) {
      return NextResponse.json({ error: 'Некорректный срок полезного использования' }, { status: 400 });
    }

    const repo = getRepository();

    // import_hash для дедупликации
    const hash = body.external_id
      ? `fa-${body.company_id}-${body.external_id}`
      : `fa-manual-${body.company_id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const now = new Date().toISOString();
    const record: any = {
      tenant_id: 'tenant-1',
      company_id: body.company_id,
      external_id: body.external_id || '',
      inventory_number: body.inventory_number || '',
      name: body.name,
      asset_group: body.asset_group || '',
      depreciation_group: body.depreciation_group || null,
      initial_cost: Number(body.initial_cost),
      salvage_value: Number(body.salvage_value || 0),
      commissioning_date: body.commissioning_date,
      useful_life_months: Number(body.useful_life_months),
      depreciation_method: body.depreciation_method || 'straight_line',
      account_id: body.account_id || 'acc-fa-001',
      depreciation_account_id: body.depreciation_account_id || 'acc-depreciation-os',
      status: body.status || 'active',
      disposal_date: body.disposal_date || null,
      suspension_date: body.suspension_date || null,
      source: 'manual',
      is_deleted: '',
      import_hash: hash,
    };

    const created = await repo.create('FixedAssets', record);

    dataCache.invalidate(CACHE_PREFIXES.DATA);
    dataCache.invalidate(CACHE_PREFIXES.REPORTS);

    return NextResponse.json({ success: true, asset: created });
  } catch (error: any) {
    console.error('Ошибка API fixed-assets POST:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 },
    );
  }
}
