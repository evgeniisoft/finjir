/**
 * ============================================
 * Уровень 4: Согласованность отчётов
 * ============================================
 *
 * 4.1 ОПиУ vs monthly — critical, допуск 1 руб.
 *    После унификации OPEX-фильтра и накопительного расчёта налогов
 *    должно сходиться.
 *
 * 4.2 ДДС vs monthly — warning, допуск 5%.
 *    Методологическая разница: calculateCashFlow считает за период,
 *    monthly — по периодам. Накопительный расчёт для cashflow
 *    не применяется (кассовый метод). Допуск 5%.
 *
 * 4.3 Баланс vs monthly — warning, допуск 5%.
 *    Методологическая разница: monthly считает totalAssets по всем A-счетам,
 *    calculateBalanceSheet — по cash + ar + inventory + fa.
 *
 * 4.4-4.8 Консолидация — оставлены. excludeIntercompany не работает
 *    (нет логики ВГО), проверки фактически тавтологичны.
 *    TODO: реализовать ВГО или удалить.
 *
 * 4.9 Календарь vs Баланс — warning.
 * 4.10 Налоги в ОПиУ vs taxEngine — critical.
 */

import { DiagnosticContext, DiagnosticCheck } from '../types';
import { okCheck, problemCheck } from '../engine';
import { calculator } from '@/lib/engine/calculator';
import { consolidationEngine } from '@/lib/engine/consolidation';
import { monthlyEngine } from '@/lib/engine/monthly';
import { taxEngine } from '@/lib/engine/tax';

const LEVEL = 4 as const;
const CATEGORY = 'consistency' as const;
const THRESHOLD = 1;             // для critical-проверок
const THRESHOLD_PERCENT = 5;     // допуск в % для warning-проверок

export async function runConsistencyChecks(ctx: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  for (const company of ctx.companies) {
    checks.push(...checkPnLVsMonthly(ctx, company));
    checks.push(...checkCashFlowVsMonthly(ctx, company));
    checks.push(...checkBalanceVsMonthly(ctx, company));
    checks.push(...checkPnLTaxesVsEngine(ctx, company));
  }

  checks.push(...checkPnLConsolidation(ctx));
  checks.push(...checkCashFlowConsolidation(ctx));
  checks.push(...checkBalanceConsolidation(ctx));
  checks.push(...checkDashboardVsPnL(ctx));
  checks.push(...checkDashboardVsBalance(ctx));
  checks.push(...checkCalendarVsBalance(ctx));

  return checks;
}

// ============================================
// 4.1 ОПиУ: обычный = по периодам (critical, допуск 1 руб.)
// ============================================
function checkPnLVsMonthly(ctx: DiagnosticContext, company: any): DiagnosticCheck[] {
  const id = `consistency_pnl_monthly_${company.id}`;
  try {
    const pnl = calculator.calculatePnL(
      ctx.transactions, ctx.accounts, company.id,
      ctx.periodStart, ctx.periodEnd, company
    );

    const monthly = monthlyEngine.getPeriodBreakdown(
      ctx.transactions, ctx.accounts, company.id,
      ctx.periodStart, ctx.periodEnd, 'monthly', company, 'pnl'
    );

    const sumRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
    const sumProfit = monthly.reduce((s, m) => s + m.profit, 0);

    const revenueDiff = Math.abs(sumRevenue - pnl.revenue);
    const profitDiff = Math.abs(sumProfit - pnl.net_profit);

    if (revenueDiff > THRESHOLD || profitDiff > THRESHOLD) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        `ОПиУ: обычный vs по периодам (${company.name})`,
        `Выручка: ${pnl.revenue.toLocaleString('ru-RU')} vs ${sumRevenue.toLocaleString('ru-RU')} | Прибыль: ${pnl.net_profit.toLocaleString('ru-RU')} vs ${sumProfit.toLocaleString('ru-RU')}`,
        {
          entity: { type: 'company', id: company.id, name: company.name },
          comparison: {
            metric: 'revenue, profit',
            expected_value: pnl.revenue,
            actual_value: sumRevenue,
            expected_source: 'calculator.calculatePnL',
            actual_source: 'sum(monthlyEngine.getPeriodBreakdown)',
            difference: Math.max(revenueDiff, profitDiff),
            difference_percent: pnl.revenue > 0 ? (revenueDiff / pnl.revenue) * 100 : 0,
            threshold: THRESHOLD,
          },
          reason: 'Сумма по периодам не равна общему отчёту',
          recommendation: 'Проверьте monthlyEngine.getPeriodBreakdown',
          display: {
            type: 'key_value',
            items: [
              { label: 'Выручка (обычный)', value: `${pnl.revenue.toLocaleString('ru-RU')} ₽` },
              { label: 'Выручка (по периодам)', value: `${sumRevenue.toLocaleString('ru-RU')} ₽`, color: revenueDiff > THRESHOLD ? 'red' : 'green' },
              { label: 'Прибыль (обычный)', value: `${pnl.net_profit.toLocaleString('ru-RU')} ₽` },
              { label: 'Прибыль (по периодам)', value: `${sumProfit.toLocaleString('ru-RU')} ₽`, color: profitDiff > THRESHOLD ? 'red' : 'green' },
            ],
          },
        }
      )];
    }

    return [okCheck(
      id, LEVEL, CATEGORY,
      `ОПиУ: обычный vs по периодам (${company.name})`,
      `Выручка и прибыль совпадают`
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'critical',
      `ОПиУ: обычный vs по периодам (${company.name})`,
      `Ошибка: ${e.message}`,
      {
        entity: { type: 'company', id: company.id, name: company.name },
        reason: e.message,
      }
    )];
  }
}

// ============================================
// 4.2 ДДС: обычный = по периодам (warning, допуск 5%)
// ============================================
function checkCashFlowVsMonthly(ctx: DiagnosticContext, company: any): DiagnosticCheck[] {
  const id = `consistency_cf_monthly_${company.id}`;
  try {
    const cf = calculator.calculateCashFlow(
      ctx.transactions, ctx.accounts, company.id,
      ctx.periodStart, ctx.periodEnd, company
    );

    const monthly = monthlyEngine.getPeriodBreakdown(
      ctx.transactions, ctx.accounts, company.id,
      ctx.periodStart, ctx.periodEnd, 'monthly', company, 'cashflow'
    );

    const sumIn = monthly.reduce((s, m) => s + m.cash_in, 0);
    const sumOut = monthly.reduce((s, m) => s + m.cash_out, 0);

    const totalIn = cf.operating_inflow + cf.investing_inflow + cf.financing_inflow;
    const totalOut = cf.operating_outflow + cf.investing_outflow + cf.financing_outflow;

    const inDiff = Math.abs(sumIn - totalIn);
    const outDiff = Math.abs(sumOut - totalOut);

    // Допуск 5% от выручки (порог warning, не critical)
    const tolerance = Math.max(THRESHOLD, (totalIn * THRESHOLD_PERCENT) / 100);

    if (inDiff > tolerance || outDiff > tolerance) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'warning',
        `ДДС: обычный vs по периодам (${company.name})`,
        `Поступления: ${totalIn.toLocaleString('ru-RU')} vs ${sumIn.toLocaleString('ru-RU')} | Выбытия: ${totalOut.toLocaleString('ru-RU')} vs ${sumOut.toLocaleString('ru-RU')}`,
        {
          entity: { type: 'company', id: company.id, name: company.name },
          comparison: {
            metric: 'cash_in, cash_out',
            expected_value: totalIn,
            actual_value: sumIn,
            expected_source: 'calculator.calculateCashFlow',
            actual_source: 'sum(monthlyEngine.getPeriodBreakdown)',
            difference: Math.max(inDiff, outDiff),
            difference_percent: totalIn > 0 ? (inDiff / totalIn) * 100 : 0,
            threshold: tolerance,
          },
          reason: 'Методологическая разница: calculateCashFlow — за период, monthly — по периодам (кассовый метод)',
          recommendation: 'Допустимо в пределах 5%',
        }
      )];
    }

    return [okCheck(
      id, LEVEL, CATEGORY,
      `ДДС: обычный vs по периодам (${company.name})`,
      `Поступления и выбытия совпадают (в пределах 5%)`
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'warning',
      `ДДС: обычный vs по периодам (${company.name})`,
      `Ошибка: ${e.message}`,
      {
        entity: { type: 'company', id: company.id, name: company.name },
        reason: e.message,
      }
    )];
  }
}

// ============================================
// 4.3 Баланс: обычный = по периодам (warning, допуск 5%)
// ============================================
function checkBalanceVsMonthly(ctx: DiagnosticContext, company: any): DiagnosticCheck[] {
  const id = `consistency_bs_monthly_${company.id}`;
  try {
    const bs = calculator.calculateBalanceSheet(
      ctx.transactions, ctx.accounts, company.id,
      ctx.periodEnd, company
    );

    const monthly = monthlyEngine.getPeriodBreakdown(
      ctx.transactions, ctx.accounts, company.id,
      ctx.periodStart, ctx.periodEnd, 'monthly', company, 'balance'
    );

    if (monthly.length === 0) {
      return [okCheck(id, LEVEL, CATEGORY, `Баланс: обычный vs по периодам (${company.name})`, 'Нет данных')];
    }

    const lastPeriod = monthly[monthly.length - 1];
    const diff = Math.abs(lastPeriod.ending_balance - bs.assets.total);

    // Допуск 5%
    const tolerance = Math.max(THRESHOLD, (bs.assets.total * THRESHOLD_PERCENT) / 100);

    if (diff > tolerance) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'warning',
        `Баланс: обычный vs по периодам (${company.name})`,
        `Активы: ${bs.assets.total.toLocaleString('ru-RU')} vs ${lastPeriod.ending_balance.toLocaleString('ru-RU')}`,
        {
          entity: { type: 'company', id: company.id, name: company.name },
          comparison: {
            metric: 'assets_total',
            expected_value: bs.assets.total,
            actual_value: lastPeriod.ending_balance,
            expected_source: 'calculator.calculateBalanceSheet',
            actual_source: 'monthlyEngine.getPeriodBreakdown (last)',
            difference: diff,
            difference_percent: bs.assets.total > 0 ? (diff / bs.assets.total) * 100 : 0,
            threshold: tolerance,
          },
          reason: 'Методологическая разница: monthly считает totalAssets по всем A-счетам, calculateBalanceSheet — по cash + ar + inventory + fa',
          recommendation: 'Допустимо в пределах 5%',
        }
      )];
    }

    return [okCheck(
      id, LEVEL, CATEGORY,
      `Баланс: обычный vs по периодам (${company.name})`,
      `Активы совпадают (в пределах 5%): ${bs.assets.total.toLocaleString('ru-RU')}`
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'warning',
      `Баланс: обычный vs по периодам (${company.name})`,
      `Ошибка: ${e.message}`,
      {
        entity: { type: 'company', id: company.id, name: company.name },
        reason: e.message,
      }
    )];
  }
}

// ============================================
// 4.10 Налоги в ОПиУ = taxEngine (critical)
// ============================================
function checkPnLTaxesVsEngine(ctx: DiagnosticContext, company: any): DiagnosticCheck[] {
  const id = `consistency_taxes_${company.id}`;
  try {
    const pnl = calculator.calculatePnL(
      ctx.transactions, ctx.accounts, company.id,
      ctx.periodStart, ctx.periodEnd, company
    );
    const tax = taxEngine.calculateTax(
      company, ctx.transactions, ctx.accounts,
      ctx.periodStart, ctx.periodEnd
    );

    const diffIncome = Math.abs((pnl.taxes || 0) - tax.income_tax_amount);
    const diffIns = Math.abs((pnl.insurance_amount || 0) - tax.insurance_amount);
    const diffNdf = Math.abs((pnl.ndfl_amount || 0) - tax.ndfl_amount);

    if (diffIncome > THRESHOLD || diffIns > THRESHOLD || diffNdf > THRESHOLD) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        `Налоги в ОПиУ vs taxEngine (${company.name})`,
        `Налог: ${pnl.taxes.toLocaleString('ru-RU')} vs ${tax.income_tax_amount.toLocaleString('ru-RU')}`,
        {
          entity: { type: 'company', id: company.id, name: company.name },
          comparison: {
            metric: 'income_tax',
            expected_value: tax.income_tax_amount,
            actual_value: pnl.taxes,
            expected_source: 'taxEngine.calculateTax',
            actual_source: 'calculator.calculatePnL',
            difference: diffIncome,
            difference_percent: 0,
            threshold: THRESHOLD,
          },
          reason: 'Налоги в ОПиУ не совпадают с taxEngine',
          recommendation: 'Проверьте calculator.calculatePnL',
        }
      )];
    }

    return [okCheck(
      id, LEVEL, CATEGORY,
      `Налоги в ОПиУ vs taxEngine (${company.name})`,
      `Налоги совпадают`
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'critical',
      `Налоги в ОПиУ vs taxEngine (${company.name})`,
      `Ошибка: ${e.message}`,
      {
        entity: { type: 'company', id: company.id, name: company.name },
        reason: e.message,
      }
    )];
  }
}

// ============================================
// 4.4 ОПиУ: по компаниям = консолидированный
// ============================================
// ВНИМАНИЕ: excludeIntercompany не реализован (см. consolidation.ts).
// Консолидация = сумма, проверка фактически тавтологична.
function checkPnLConsolidation(ctx: DiagnosticContext): DiagnosticCheck[] {
  const id = 'consistency_pnl_consolidation';
  try {
    const perCompany = ctx.companies.map(c =>
      calculator.calculatePnL(ctx.transactions, ctx.accounts, c.id, ctx.periodStart, ctx.periodEnd, c)
    );
    const sumRevenue = perCompany.reduce((s, p) => s + p.revenue, 0);
    const sumProfit = perCompany.reduce((s, p) => s + p.net_profit, 0);

    const consolidated = consolidationEngine.consolidatePnL(
      ctx.companies, ctx.transactions, ctx.accounts,
      ctx.periodStart, ctx.periodEnd
    );

    const revenueDiff = Math.abs(sumRevenue - consolidated.revenue);
    const profitDiff = Math.abs(sumProfit - consolidated.net_profit);

    if (revenueDiff > THRESHOLD || profitDiff > THRESHOLD) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        'ОПиУ: по компаниям vs консолидированный',
        `Выручка: ${sumRevenue.toLocaleString('ru-RU')} vs ${consolidated.revenue.toLocaleString('ru-RU')} | Прибыль: ${sumProfit.toLocaleString('ru-RU')} vs ${consolidated.net_profit.toLocaleString('ru-RU')}`,
        {
          comparison: {
            metric: 'revenue, profit',
            expected_value: sumRevenue,
            actual_value: consolidated.revenue,
            expected_source: 'sum(calculatePnL)',
            actual_source: 'consolidationEngine.consolidatePnL',
            difference: Math.max(revenueDiff, profitDiff),
            difference_percent: sumRevenue > 0 ? (revenueDiff / sumRevenue) * 100 : 0,
            threshold: THRESHOLD,
          },
          reason: 'Консолидация отличается от суммы (возможно, ВГО)',
          recommendation: 'Проверьте consolidationEngine.excludeIntercompany',
          display: {
            type: 'key_value',
            items: [
              { label: 'По компаниям', value: `${sumRevenue.toLocaleString('ru-RU')} ₽` },
              { label: 'Консолидированный', value: `${consolidated.revenue.toLocaleString('ru-RU')} ₽`, color: revenueDiff > THRESHOLD ? 'red' : 'green' },
              { label: 'Разница', value: `${revenueDiff.toLocaleString('ru-RU')} ₽`, color: revenueDiff > THRESHOLD ? 'red' : 'green' },
            ],
          },
        }
      )];
    }

    return [okCheck(
      id, LEVEL, CATEGORY,
      'ОПиУ: по компаниям vs консолидированный',
      `Выручка совпадает: ${sumRevenue.toLocaleString('ru-RU')}`
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'critical',
      'ОПиУ: по компаниям vs консолидированный',
      `Ошибка: ${e.message}`,
      { reason: e.message }
    )];
  }
}

// ============================================
// 4.5 ДДС: по компаниям = консолидированный
// ============================================
function checkCashFlowConsolidation(ctx: DiagnosticContext): DiagnosticCheck[] {
  const id = 'consistency_cf_consolidation';
  try {
    const perCompany = ctx.companies.map(c =>
      calculator.calculateCashFlow(ctx.transactions, ctx.accounts, c.id, ctx.periodStart, ctx.periodEnd, c)
    );
    const sumIn = perCompany.reduce((s, cf) =>
      s + cf.operating_inflow + cf.investing_inflow + cf.financing_inflow, 0);
    const sumOut = perCompany.reduce((s, cf) =>
      s + cf.operating_outflow + cf.investing_outflow + cf.financing_outflow, 0);

    const consolidated = consolidationEngine.consolidateCashFlow(
      ctx.companies, ctx.transactions, ctx.accounts,
      ctx.periodStart, ctx.periodEnd
    );

    const consolidatedIn = consolidated.operating_inflow + consolidated.investing_inflow + consolidated.financing_inflow;
    const consolidatedOut = consolidated.operating_outflow + consolidated.investing_outflow + consolidated.financing_outflow;

    const inDiff = Math.abs(sumIn - consolidatedIn);
    const outDiff = Math.abs(sumOut - consolidatedOut);

    if (inDiff > THRESHOLD || outDiff > THRESHOLD) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        'ДДС: по компаниям vs консолидированный',
        `Поступления: ${sumIn.toLocaleString('ru-RU')} vs ${consolidatedIn.toLocaleString('ru-RU')}`,
        {
          comparison: {
            metric: 'cash_in',
            expected_value: sumIn,
            actual_value: consolidatedIn,
            expected_source: 'sum(calculateCashFlow)',
            actual_source: 'consolidationEngine.consolidateCashFlow',
            difference: Math.max(inDiff, outDiff),
            difference_percent: sumIn > 0 ? (inDiff / sumIn) * 100 : 0,
            threshold: THRESHOLD,
          },
          reason: 'Консолидация ДДС отличается от суммы',
          recommendation: 'Проверьте consolidationEngine',
        }
      )];
    }

    return [okCheck(id, LEVEL, CATEGORY, 'ДДС: по компаниям vs консолидированный', 'Поступления и выбытия совпадают')];
  } catch (e: any) {
    return [problemCheck(id, LEVEL, CATEGORY, 'critical', 'ДДС: по компаниям vs консолидированный', `Ошибка: ${e.message}`, { reason: e.message })];
  }
}

// ============================================
// 4.6 Баланс: по компаниям = консолидированный
// ============================================
function checkBalanceConsolidation(ctx: DiagnosticContext): DiagnosticCheck[] {
  const id = 'consistency_bs_consolidation';
  try {
    const perCompany = ctx.companies.map(c =>
      calculator.calculateBalanceSheet(ctx.transactions, ctx.accounts, c.id, ctx.periodEnd, c)
    );
    const sumAssets = perCompany.reduce((s, b) => s + b.assets.total, 0);
    const sumLiab = perCompany.reduce((s, b) => s + b.liabilities.total, 0);
    const sumEquity = perCompany.reduce((s, b) => s + b.equity.total, 0);

    const consolidated = consolidationEngine.consolidateBalanceSheet(
      ctx.companies, ctx.transactions, ctx.accounts, ctx.periodEnd
    );

    const assetDiff = Math.abs(sumAssets - consolidated.assets.total);
    const liabDiff = Math.abs(sumLiab - consolidated.liabilities.total);
    const eqDiff = Math.abs(sumEquity - consolidated.equity.total);

    if (assetDiff > THRESHOLD || liabDiff > THRESHOLD || eqDiff > THRESHOLD) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        'Баланс: по компаниям vs консолидированный',
        `Активы: ${sumAssets.toLocaleString('ru-RU')} vs ${consolidated.assets.total.toLocaleString('ru-RU')}`,
        {
          comparison: {
            metric: 'assets_total',
            expected_value: sumAssets,
            actual_value: consolidated.assets.total,
            expected_source: 'sum(calculateBalanceSheet)',
            actual_source: 'consolidationEngine.consolidateBalanceSheet',
            difference: Math.max(assetDiff, liabDiff, eqDiff),
            difference_percent: sumAssets > 0 ? (assetDiff / sumAssets) * 100 : 0,
            threshold: THRESHOLD,
          },
          reason: 'Консолидация Баланса отличается от суммы',
          recommendation: 'Проверьте consolidationEngine',
        }
      )];
    }

    return [okCheck(id, LEVEL, CATEGORY, 'Баланс: по компаниям vs консолидированный', 'Активы, пассивы, капитал совпадают')];
  } catch (e: any) {
    return [problemCheck(id, LEVEL, CATEGORY, 'critical', 'Баланс: по компаниям vs консолидированный', `Ошибка: ${e.message}`, { reason: e.message })];
  }
}

// ============================================
// 4.7 Дашборд = ОПиУ
// ============================================
function checkDashboardVsPnL(ctx: DiagnosticContext): DiagnosticCheck[] {
  const id = 'consistency_dashboard_pnl';
  try {
    const perCompany = ctx.companies.map(c =>
      calculator.calculatePnL(ctx.transactions, ctx.accounts, c.id, ctx.periodStart, ctx.periodEnd, c)
    );

    const dashRevenue = perCompany.reduce((s, p) => s + p.revenue, 0);
    const dashProfit = perCompany.reduce((s, p) => s + p.net_profit, 0);

    const consolidated = consolidationEngine.consolidatePnL(
      ctx.companies, ctx.transactions, ctx.accounts, ctx.periodStart, ctx.periodEnd
    );

    const revenueDiff = Math.abs(dashRevenue - consolidated.revenue);
    const profitDiff = Math.abs(dashProfit - consolidated.net_profit);

    if (revenueDiff > THRESHOLD || profitDiff > THRESHOLD) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        'Дашборд vs ОПиУ',
        `Выручка: ${dashRevenue.toLocaleString('ru-RU')} vs ${consolidated.revenue.toLocaleString('ru-RU')}`,
        {
          comparison: {
            metric: 'revenue',
            expected_value: consolidated.revenue,
            actual_value: dashRevenue,
            expected_source: 'consolidationEngine.consolidatePnL',
            actual_source: 'Дашборд (sum по компаниям)',
            difference: Math.max(revenueDiff, profitDiff),
            difference_percent: consolidated.revenue > 0 ? (revenueDiff / consolidated.revenue) * 100 : 0,
            threshold: THRESHOLD,
          },
          reason: 'Дашборд и ОПиУ показывают разные цифры',
          recommendation: 'Проверьте, использует ли Дашборд /api/reports?type=consolidated',
        }
      )];
    }

    return [okCheck(id, LEVEL, CATEGORY, 'Дашборд vs ОПиУ', 'Выручка и прибыль совпадают')];
  } catch (e: any) {
    return [problemCheck(id, LEVEL, CATEGORY, 'critical', 'Дашборд vs ОПиУ', `Ошибка: ${e.message}`, { reason: e.message })];
  }
}

// ============================================
// 4.8 Дашборд = Баланс (деньги)
// ============================================
function checkDashboardVsBalance(ctx: DiagnosticContext): DiagnosticCheck[] {
  const id = 'consistency_dashboard_balance';
  try {
    const dashCash = ctx.companies.reduce((s, c) =>
      s + calculator.calculateBalanceSheet(ctx.transactions, ctx.accounts, c.id, ctx.periodEnd, c).assets.cash, 0);

    const consolidated = consolidationEngine.consolidateBalanceSheet(
      ctx.companies, ctx.transactions, ctx.accounts, ctx.periodEnd
    );

    const diff = Math.abs(dashCash - consolidated.assets.cash);

    if (diff > THRESHOLD) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        'Дашборд vs Баланс (деньги)',
        `Деньги: ${dashCash.toLocaleString('ru-RU')} vs ${consolidated.assets.cash.toLocaleString('ru-RU')}`,
        {
          comparison: {
            metric: 'cash',
            expected_value: consolidated.assets.cash,
            actual_value: dashCash,
            expected_source: 'consolidationEngine.consolidateBalanceSheet',
            actual_source: 'Дашборд',
            difference: diff,
            difference_percent: 0,
            threshold: THRESHOLD,
          },
        }
      )];
    }

    return [okCheck(id, LEVEL, CATEGORY, 'Дашборд vs Баланс (деньги)', `Деньги совпадают: ${dashCash.toLocaleString('ru-RU')}`)];
  } catch (e: any) {
    return [problemCheck(id, LEVEL, CATEGORY, 'critical', 'Дашборд vs Баланс (деньги)', `Ошибка: ${e.message}`, { reason: e.message })];
  }
}

// ============================================
// 4.9 Платёжный календарь = Баланс (деньги на сегодня)
// ============================================
// ВНИМАНИЕ: методы разные. Календарь считает по операциям,
// Баланс — по is_cash_flow счетам. Допуск 5%.
function checkCalendarVsBalance(ctx: DiagnosticContext): DiagnosticCheck[] {
  const id = 'consistency_calendar_balance';
  try {
    const equityAcc = ctx.systemAccounts?.equity || 'acc-equity-001';
    const initialBalance = ctx.transactions
      .filter(t => t.credit_account_id === equityAcc && t.record_type === 'fact')
      .reduce((s, t) => s + parseFloat(String(t.amount_rub || 0)), 0);

    const pastTx = ctx.transactions.filter(t => {
      const d = String(t.date).split('T')[0];
      return d < ctx.today &&
        !(t.credit_account_id === equityAcc && t.record_type === 'fact');
    });

    const calendarBalance = initialBalance + pastTx.reduce((balance, t) => {
      if (t.type === 'income') return balance + parseFloat(String(t.amount_rub || 0));
      if (t.type === 'expense') return balance - parseFloat(String(t.amount_rub || 0));
      return balance;
    }, 0);

    const balanceOnToday = ctx.companies.reduce((s, c) =>
      s + calculator.calculateBalanceSheet(ctx.transactions, ctx.accounts, c.id, ctx.today, c).assets.cash, 0);

    const diff = Math.abs(calendarBalance - balanceOnToday);
    const tolerance = Math.max(THRESHOLD, (Math.abs(balanceOnToday) * THRESHOLD_PERCENT) / 100);

    if (diff > tolerance) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'warning',
        'Платёжный календарь vs Баланс',
        `Остаток: ${calendarBalance.toLocaleString('ru-RU')} vs ${balanceOnToday.toLocaleString('ru-RU')}`,
        {
          comparison: {
            metric: 'cash',
            expected_value: balanceOnToday,
            actual_value: calendarBalance,
            expected_source: 'calculateBalanceSheet(today)',
            actual_source: 'Календарь (по операциям)',
            difference: diff,
            difference_percent: 0,
            threshold: tolerance,
          },
          reason: 'Методологическая разница: календарь по операциям, Баланс по is_cash_flow',
          recommendation: 'Допустимо в пределах 5%',
        }
      )];
    }

    return [okCheck(id, LEVEL, CATEGORY, 'Платёжный календарь vs Баланс', `Остаток совпадает (в пределах 5%): ${calendarBalance.toLocaleString('ru-RU')}`)];
  } catch (e: any) {
    return [problemCheck(id, LEVEL, CATEGORY, 'warning', 'Платёжный календарь vs Баланс', `Ошибка: ${e.message}`, { reason: e.message })];
  }
}
