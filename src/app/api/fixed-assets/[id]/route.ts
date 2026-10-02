/**
 * ============================================
 * API: Основное средство (чтение / обновление / удаление)
 * ============================================
 * GET    /api/fixed-assets/[id]
 * PATCH  /api/fixed-assets/[id]
 * DELETE /api/fixed-assets/[id]
 *
 * Защита: owner / admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';
import { dataCache, CACHE_PREFIXES } from '@/lib/cache';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const { id } = await context.params;

    const repo = getRepository();
    const asset = await repo.getById('FixedAssets', id);

    if (!asset) {
      return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
    }

    return NextResponse.json(asset);
  } catch (error: any) {
    console.error('Ошибка API fixed-assets GET /[id]:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();

    const repo = getRepository();

    // Разрешённые к обновлению поля
    const update: any = {};
    const allowed = [
      'name', 'external_id', 'inventory_number',
      'asset_group', 'depreciation_group',
      'initial_cost', 'salvage_value',
      'commissioning_date', 'useful_life_months', 'depreciation_method',
      'account_id', 'depreciation_account_id',
      'status', 'disposal_date', 'suspension_date',
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key];
    }

    // Нормализация типов
    if (update.initial_cost !== undefined) update.initial_cost = Number(update.initial_cost);
    if (update.salvage_value !== undefined) update.salvage_value = Number(update.salvage_value);
    if (update.useful_life_months !== undefined) update.useful_life_months = Number(update.useful_life_months);
    if (update.depreciation_group !== undefined) {
      update.depreciation_group = update.depreciation_group === null || update.depreciation_group === ''
        ? null
        : Number(update.depreciation_group);
    }

    const updated = await repo.update('FixedAssets', id, update);

    dataCache.invalidate(CACHE_PREFIXES.DATA);
    dataCache.invalidate(CACHE_PREFIXES.REPORTS);

    return NextResponse.json({ success: true, asset: updated });
  } catch (error: any) {
    console.error('Ошибка API fixed-assets PATCH:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const { id } = await context.params;
    const repo = getRepository();

    // Soft-delete: помечаем is_deleted
    await repo.update('FixedAssets', id, {
      is_deleted: 'true',
      deleted_at: new Date().toISOString(),
    });

    dataCache.invalidate(CACHE_PREFIXES.DATA);
    dataCache.invalidate(CACHE_PREFIXES.REPORTS);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Ошибка API fixed-assets DELETE:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 },
    );
  }
}
