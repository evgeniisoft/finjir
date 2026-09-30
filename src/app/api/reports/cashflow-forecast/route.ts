/**
 * ============================================
 * FinEngine 2026 - API: Прогноз кассовых разрывов
 * ============================================
 * GET /api/reports/cashflow-forecast
 *   ?start_date=2026-09-30         (по умолчанию — сегодня)
 *   &horizon_days=30               (7, 30, 90, 180, 365)
 *   &company_id=comp-test-1        (опционально — только по компании)
 *   &include_plan=true             (по умолчанию true)
 *   &include_taxes=true            (по умолчанию true)
 *   &view=consolidated|by_company|both  (по умолчанию both)
 */

import { NextRequest, NextResponse } from 'next/server';
import { cashflowForecastEngine } from '@/lib/engine/cashflow-forecast';
import { getRepository } from '@/lib/dal/repository';
import { loadSystemAccounts } from '@/lib/config/accounts';
import { getSessionUser } from '@/lib/auth-server';

const ALLOWED_HORIZONS = [7, 30, 90, 180, 365];

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const url = new URL(request.url);

    // ============================================
    // Параметры
    // ============================================
    const today = new Date().toISOString().split('T')[0];
    const start_date = url.searchParams.get('start_date') || today;

    // Валидация start_date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return NextResponse.json(
        { error: 'Неверный формат start_date. Ожидается YYYY-MM-DD' },
        { status: 400 },
      );
    }

    const horizonRaw = parseInt(url.searchParams.get('horizon_days') || '30', 10);
    const horizon_days = ALLOWED_HORIZONS.includes(horizonRaw) ? horizonRaw : 30;

    const company_id = url.searchParams.get('company_id') || null;

    const include_plan = url.searchParams.get('include_plan') !== 'false';
    const include_taxes = url.searchParams.get('include_taxes') !== 'false';

    const view = url.searchParams.get('view') || 'both';
    if (!['consolidated', 'by_company', 'both'].includes(view)) {
      return NextResponse.json(
        { error: 'view должен быть consolidated | by_company | both' },
        { status: 400 },
      );
    }

    // ============================================
    // Загрузка данных
    // ============================================
    const repo = getRepository();
    const [transactions, accounts, companies, budgets, settings] = await Promise.all([
      repo.getAll('Transactions'),
      repo.getAll('Accounts'),
      repo.getAll('Companies'),
      repo.getAll('Budgets'),
      repo.getAll('Settings'),
    ]);

    loadSystemAccounts(settings);

    if (!companies || companies.length === 0) {
      return NextResponse.json(
        {
          params: {
            start_date,
            end_date: start_date,
            horizon_days,
            company_id,
            include_plan,
            include_taxes,
          },
          consolidated: { days: [], gaps: [], starting_balance: 0, ending_balance: 0, total_inflow: 0, total_outflow: 0 },
          by_company: [],
        },
        { status: 200 },
      );
    }

    // ============================================
    // Прогноз
    // ============================================
    const result = await cashflowForecastEngine.forecast({
      transactions,
      accounts,
      companies,
      budgets,
      settings,
      start_date,
      horizon_days,
      company_id,
      include_plan,
      include_taxes,
    });

    // ============================================
    // Фильтрация по view
    // ============================================
    if (view === 'consolidated') {
      return NextResponse.json({
        params: result.params,
        consolidated: result.consolidated,
        by_company: [],
      });
    }

    if (view === 'by_company') {
      return NextResponse.json({
        params: result.params,
        consolidated: { days: [], gaps: [], starting_balance: 0, ending_balance: 0, total_inflow: 0, total_outflow: 0 },
        by_company: result.by_company,
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Ошибка API cashflow-forecast:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 },
    );
  }
}
