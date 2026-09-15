/**
 * ============================================
 * Уровень 3: Формулы
 * ============================================
 */

import { DiagnosticContext, DiagnosticCheck } from '../types';
import { okCheck, problemCheck } from '../engine';
import { calculator } from '@/lib/engine/calculator';
import { taxEngine } from '@/lib/engine/tax';

const LEVEL = 3 as const;
const CATEGORY = 'calculations' as const;
const THRESHOLD = 1;

export async function runCalculationChecks(ctx: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  for (const company of ctx.companies) {
    checks.push(...checkPnLFormula(ctx, company));
    checks.push(...checkCashFlowFormula(ctx, company));
    checks.push(...checkBalanceFormula(ctx, company));
    checks.push(...checkTaxFormula(ctx, company));
  }

  return checks;
}

// ============================================
// 3.1 ОПиУ: формула
// ============================================
function checkPnLFormula(ctx: DiagnosticContext, company: any): DiagnosticCheck[] {
  const id = `calc_pnl_${company.id}`;
  try {
    const pnl = calculator.calculatePnL(
      ctx.transactions, ctx.accounts, company.id,
      ctx.periodStart, ctx.periodEnd, company
    );

    const expected = pnl.revenue
      - pnl.cost_of_goods_sold
      - pnl.operating_expenses
      - (pnl.insurance_amount || 0)
      - (pnl.ndfl_amount || 0)
      - pnl.depreciation
      - pnl.taxes;

    const diff = Math.abs(expected - pnl.net_profit);

    if (diff > THRESHOLD) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        `ОПиУ: формула (${company.name})`,
        `net_profit не сходится: ожидалось ${expected.toLocaleString('ru-RU')}, получено ${pnl.net_profit.toLocaleString('ru-RU')}`,
        {
          entity: { type: 'company', id: company.id, name: company.name },
          comparison: {
            metric: 'net_profit',
            expected_value: expected,
            actual_value: pnl.net_profit,
            expected_source: 'revenue - cogs - opex - taxes',
            actual_source: 'calculatePnL().net_profit',
            difference: diff,
            difference_percent: pnl.revenue > 0 ? (diff / pnl.revenue) * 100 : 0,
            threshold: THRESHOLD,
          },
          reason: 'Формула ОПиУ нарушена',
          recommendation: 'Проверьте calculator.calculatePnL',
        }
      )];
    }

    return [okCheck(
      id, LEVEL, CATEGORY,
      `ОПиУ: формула (${company.name})`,
      `net_profit = ${pnl.net_profit.toLocaleString('ru-RU')}`
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'critical',
      `ОПиУ: формула (${company.name})`,
      `Ошибка расчёта: ${e.message}`,
      {
        entity: { type: 'company', id: company.id, name: company.name },
        reason: e.message,
      }
    )];
  }
}

// ============================================
// 3.2 ДДС: формула
// ============================================
function checkCashFlowFormula(ctx: DiagnosticContext, company: any): DiagnosticCheck[] {
  const id = `calc_cf_${company.id}`;
  try {
    const cf = calculator.calculateCashFlow(
      ctx.transactions, ctx.accounts, company.id,
      ctx.periodStart, ctx.periodEnd, company
    );

    // ending_balance = start + in - out - tax_outflow
    const expected = cf.starting_balance
      + cf.operating_inflow - cf.operating_outflow
      + cf.investing_inflow - cf.investing_outflow
      + cf.financing_inflow - cf.financing_outflow
      - (cf.tax_outflow || 0);

    const diff = Math.abs(expected - cf.ending_balance);

    if (diff > THRESHOLD) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        `ДДС: формула (${company.name})`,
        `ending_balance не сходится: ожидалось ${expected.toLocaleString('ru-RU')}, получено ${cf.ending_balance.toLocaleString('ru-RU')}`,
        {
          entity: { type: 'company', id: company.id, name: company.name },
          comparison: {
            metric: 'ending_balance',
            expected_value: expected,
            actual_value: cf.ending_balance,
            expected_source: 'start + in - out',
            actual_source: 'calculateCashFlow().ending_balance',
            difference: diff,
            difference_percent: 0,
            threshold: THRESHOLD,
          },
          reason: 'Формула ДДС нарушена',
          recommendation: 'Проверьте calculator.calculateCashFlow',
        }
      )];
    }

    return [okCheck(
      id, LEVEL, CATEGORY,
      `ДДС: формула (${company.name})`,
      `ending_balance = ${cf.ending_balance.toLocaleString('ru-RU')}`
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'critical',
      `ДДС: формула (${company.name})`,
      `Ошибка расчёта: ${e.message}`,
      {
        entity: { type: 'company', id: company.id, name: company.name },
        reason: e.message,
      }
    )];
  }
}

// ============================================
// 3.3 Баланс: формула
// ============================================
function checkBalanceFormula(ctx: DiagnosticContext, company: any): DiagnosticCheck[] {
  const id = `calc_bs_${company.id}`;
  try {
    const bs = calculator.calculateBalanceSheet(
      ctx.transactions, ctx.accounts, company.id,
      ctx.periodEnd, company
    );

    const expected = bs.liabilities.total + bs.equity.total;
    const diff = Math.abs(expected - bs.assets.total);

    if (diff > THRESHOLD) {
      return [problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        `Баланс: Активы = Пассивы + Капитал (${company.name})`,
        `Баланс не сходится: активы ${bs.assets.total.toLocaleString('ru-RU')}, пассивы+капитал ${expected.toLocaleString('ru-RU')}`,
        {
          entity: { type: 'company', id: company.id, name: company.name },
          comparison: {
            metric: 'assets_total',
            expected_value: expected,
            actual_value: bs.assets.total,
            expected_source: 'liabilities.total + equity.total',
            actual_source: 'assets.total',
            difference: diff,
            difference_percent: bs.assets.total > 0 ? (diff / bs.assets.total) * 100 : 0,
            threshold: THRESHOLD,
          },
          reason: 'Баланс не сходится',
          recommendation: 'Проверьте calculator.calculateBalanceSheet',
        }
      )];
    }

    return [okCheck(
      id, LEVEL, CATEGORY,
      `Баланс: Активы = Пассивы + Капитал (${company.name})`,
      `Активы = ${bs.assets.total.toLocaleString('ru-RU')}`
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'critical',
      `Баланс: формула (${company.name})`,
      `Ошибка расчёта: ${e.message}`,
      {
        entity: { type: 'company', id: company.id, name: company.name },
        reason: e.message,
      }
    )];
  }
}

// ============================================
// 3.4 Налоги: формула УСН
// ============================================
function checkTaxFormula(ctx: DiagnosticContext, company: any): DiagnosticCheck[] {
  const id = `calc_tax_${company.id}`;
  try {
    const tax = taxEngine.calculateTax(
      company, ctx.transactions, ctx.accounts,
      ctx.periodStart, ctx.periodEnd
    );

    // УСН 6%: налог = revenue × 0.06, уменьшенный на взносы (не более 50%)
    if (company.tax_system === 'USN_6') {
      const baseTax = tax.revenue_without_vat * 0.06;
      const isIndividual = String(company.is_individual).toLowerCase() === 'true';
      const maxReduction = isIndividual ? baseTax : baseTax * 0.5;
      const expected = Math.max(baseTax - Math.min(tax.insurance_amount, maxReduction), 0);
      const diff = Math.abs(expected - tax.income_tax_amount);

      if (diff > THRESHOLD) {
        return [problemCheck(
          id, LEVEL, CATEGORY, 'warning',
          `УСН 6%: формула (${company.name})`,
          `Налог не сходится: ожидалось ${expected.toLocaleString('ru-RU')}, получено ${tax.income_tax_amount.toLocaleString('ru-RU')}`,
          {
            entity: { type: 'company', id: company.id, name: company.name },
            comparison: {
              metric: 'income_tax_amount',
              expected_value: expected,
              actual_value: tax.income_tax_amount,
              expected_source: 'revenue × 0.06 - взносы',
              actual_source: 'taxEngine.calculateTax',
              difference: diff,
              difference_percent: baseTax > 0 ? (diff / baseTax) * 100 : 0,
              threshold: THRESHOLD,
            },
          }
        )];
      }
    }

    // ОСНО: НДС = outgoing - incoming
    if (company.tax_system === 'OSNO') {
      const expectedVat = Math.max(0, tax.outgoing_vat - tax.incoming_vat);
      const diff = Math.abs(expectedVat - tax.vat_to_pay);

      if (diff > THRESHOLD) {
        return [problemCheck(
          id, LEVEL, CATEGORY, 'warning',
          `ОСНО: формула НДС (${company.name})`,
          `НДС не сходится: ожидалось ${expectedVat.toLocaleString('ru-RU')}, получено ${tax.vat_to_pay.toLocaleString('ru-RU')}`,
          {
            entity: { type: 'company', id: company.id, name: company.name },
            comparison: {
              metric: 'vat_to_pay',
              expected_value: expectedVat,
              actual_value: tax.vat_to_pay,
              expected_source: 'outgoing - incoming',
              actual_source: 'taxEngine.calculateTax',
              difference: diff,
              difference_percent: 0,
              threshold: THRESHOLD,
            },
          }
        )];
      }
    }

    return [okCheck(
      id, LEVEL, CATEGORY,
      `Налоги: формула (${company.name})`,
      `income_tax = ${tax.income_tax_amount.toLocaleString('ru-RU')}`
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'critical',
      `Налоги: формула (${company.name})`,
      `Ошибка расчёта: ${e.message}`,
      {
        entity: { type: 'company', id: company.id, name: company.name },
        reason: e.message,
      }
    )];
  }
}
