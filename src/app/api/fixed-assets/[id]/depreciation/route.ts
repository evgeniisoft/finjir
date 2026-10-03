/**
 * ============================================
 * API: График амортизации по одному ОС
 * ============================================
 * GET /api/fixed-assets/[id]/depreciation?as_of=YYYY-MM-DD
 *
 * Возвращает:
 *   - asset:      данные ОС
 *   - summary:    initial / accumulated / residual на as_of
 *   - schedule:   месяцы с суммами (fact/plan, created/missing)
 *   - transactions: связанные транзакции из БД
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';

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
    const url = new URL(request.url);
    const asOfDate = url.searchParams.get('as_of') || new Date().toISOString().split('T')[0];

    const repo = getRepository();
    const asset = await repo.getById('FixedAssets', id);

    if (!asset) {
      return NextResponse.json({ error: 'ОС не найдено' }, { status: 404 });
    }

    // ============================================
    // Параметры ОС
    // ============================================
    const initialCost = Number(asset.initial_cost || 0);
    const salvageValue = Number(asset.salvage_value || 0);
    const usefulLife = Number(asset.useful_life_months || 0);

    if (initialCost <= 0 || usefulLife <= 0) {
      return NextResponse.json({
        asset,
        summary: { initial_cost: initialCost, accumulated: 0, residual: initialCost },
        schedule: [],
        transactions: [],
        message: 'Некорректные параметры ОС',
      });
    }

    const monthlyAmount = (initialCost - salvageValue) / usefulLife;

    // ============================================
    // Начало амортизации (со следующего месяца после ввода)
    // ============================================
    const commissioningDate = new Date(asset.commissioning_date);
    const startYM = new Date(
      Date.UTC(
        commissioningDate.getUTCFullYear(),
        commissioningDate.getUTCMonth() + 1,
        1,
      ),
    );

    // ============================================
    // Конец амортизации (срок или выбытие)
    // ============================================
    const disposalDate = asset.disposal_date ? new Date(asset.disposal_date) : null;
    const endYMFromLife = new Date(
      Date.UTC(
        startYM.getUTCFullYear(),
        startYM.getUTCMonth() + usefulLife - 1,
        1,
      ),
    );
    const endYM = disposalDate && disposalDate < endYMFromLife
      ? new Date(Date.UTC(disposalDate.getUTCFullYear(), disposalDate.getUTCMonth(), 1))
      : endYMFromLife;

    // ============================================
    // Загружаем связанные транзакции
    // ============================================
    const allTx = await repo.getAll('Transactions');
    const assetTx = allTx.filter((t: any) => {
      if (t.company_id !== asset.company_id) return false;
      if (String(t.is_deleted || '') === 'true') return false;
      return String(t.import_hash || '').startsWith(`depreciation-${asset.id}-`);
    });

    const txByMonth = new Map<string, any>();
    for (const t of assetTx) {
      const dateStr = String(t.date).split('T')[0];
      const ym = dateStr.substring(0, 7);
      txByMonth.set(ym, t);
    }

    // ============================================
    // Строим график по месяцам
    // ============================================
    const schedule: Array<{
      period: string;
      date: string;
      amount: number;
      accumulated: number;
      residual: number;
      record_type: 'fact' | 'plan' | 'missing';
      transaction_id: string | null;
    }> = [];

    let accumulated = 0;
    let current = new Date(startYM);
    const asOf = new Date(asOfDate + 'T23:59:59.999Z');

    while (current <= endYM) {
      const year = current.getUTCFullYear();
      const month = current.getUTCMonth() + 1;
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const dateStr = `${ym}-${String(lastDay).padStart(2, '0')}`;

      accumulated += monthlyAmount;
      const residual = initialCost - accumulated;

      const existingTx = txByMonth.get(ym);
      const isFuture = new Date(dateStr + 'T00:00:00.000Z') > asOf;

      schedule.push({
        period: ym,
        date: dateStr,
        amount: Math.round(monthlyAmount * 100) / 100,
        accumulated: Math.round(accumulated * 100) / 100,
        residual: Math.round(residual * 100) / 100,
        record_type: existingTx
          ? existingTx.record_type === 'fact'
            ? 'fact'
            : 'plan'
          : isFuture
            ? 'plan'
            : 'missing',
        transaction_id: existingTx?.id || null,
      });

      current = new Date(Date.UTC(year, month, 1));
    }

    // ============================================
    // Итоги на as_of
    // ============================================
    let accumulatedAsOf = 0;
    let monthsElapsed = 0;
    const asOfYM = `${asOfDate.substring(0, 4)}-${asOfDate.substring(5, 7)}`;
    for (const row of schedule) {
      if (row.period <= asOfYM) {
        accumulatedAsOf = row.accumulated;
        monthsElapsed += 1;
      } else {
        break;
      }
    }
    const residualAsOf = initialCost - accumulatedAsOf;

    // ============================================
    // Связанные транзакции (для отображения)
    // ============================================
    const transactions = assetTx
      .map((t: any) => ({
        id: t.id,
        date: String(t.date).split('T')[0],
        description: t.description,
        amount: Number(t.amount_rub || 0),
        record_type: t.record_type,
        source: t.source,
      }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));

    return NextResponse.json({
      asset,
      as_of: asOfDate,
      summary: {
        initial_cost: initialCost,
        salvage_value: salvageValue,
        useful_life_months: usefulLife,
        monthly_amount: Math.round(monthlyAmount * 100) / 100,
        accumulated: Math.round(accumulatedAsOf * 100) / 100,
        residual: Math.round(residualAsOf * 100) / 100,
        months_elapsed: monthsElapsed,
        months_total: usefulLife,
        months_remaining: Math.max(0, usefulLife - monthsElapsed),
      },
      schedule,
      transactions,
    });
  } catch (error: any) {
    console.error('Ошибка API fixed-asset depreciation:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 },
    );
  }
}
