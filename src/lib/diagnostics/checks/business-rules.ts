/**
 * ============================================
 * Уровень 5: Бизнес-правила
 * ============================================
 */

import { DiagnosticContext, DiagnosticCheck } from '../types';
import { okCheck, problemCheck } from '../engine';
import { taxEngine } from '@/lib/engine/tax';
import { calculator } from '@/lib/engine/calculator';
import { cashflowForecastEngine } from '@/lib/engine/cashflow-forecast';

const LEVEL = 5 as const;
const CATEGORY = 'business_rules' as const;

export async function runBusinessRuleChecks(ctx: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  // 5.1 Лимиты УСН
  checks.push(...checkUSNLimits(ctx));

  // 5.2 Кассовые разрывы
  checks.push(...await checkCashGaps(ctx));

  // 5.3 Рентабельность
  checks.push(...checkProfitability(ctx));

  // 5.4 Дебиторка / Кредиторка
  checks.push(...checkARAP(ctx));

  // 5.5 Сходимость налогов: начислено vs уплачено
  checks.push(...checkTaxConsistency(ctx));

  return checks;
}

// ============================================
// 5.1 Лимиты УСН
// ============================================
function checkUSNLimits(ctx: DiagnosticContext): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  for (const company of ctx.companies) {
    if (company.tax_system !== 'USN_6' && company.tax_system !== 'USN_15') continue;

    const id = `usn_limits_${company.id}`;
    try {
      const limits = taxEngine.checkUSNLimits(company, ctx.transactions);

      if (limits.transition_required) {
        checks.push(problemCheck(
          id, LEVEL, CATEGORY, 'critical',
          `Переход на ОСНО: ${company.name}`,
          `Превышен лимит УСН. Переход с ${limits.transition_quarter}`,
          {
            entity: { type: 'company', id: company.id, name: company.name },
            count: 1,
            details: { limits },
            reason: 'Выручка превысила 490.5 млн ₽',
            recommendation: 'Срочно подайте уведомление о переходе на ОСНО',
            display: {
              type: 'progress_bar',
              title: 'Лимит УСН (490.5 млн)',
              percent: limits.limits.max.used_percent,
              threshold: limits.limits.max.threshold,
              threshold_label: 'Переход на ОСНО',
            },
          }
        ));
      } else if (limits.limits.max.used_percent > 80) {
        checks.push(problemCheck(
          id, LEVEL, CATEGORY, 'warning',
          `Приближение к лимиту УСН: ${company.name}`,
          `Использовано ${limits.limits.max.used_percent}% лимита`,
          {
            entity: { type: 'company', id: company.id, name: company.name },
            count: 1,
            details: { limits },
            recommendation: 'Планируйте переход на ОСНО',
            display: {
              type: 'progress_bar',
              title: 'Лимит УСН',
              percent: limits.limits.max.used_percent,
              threshold: limits.limits.max.threshold,
              threshold_label: 'Лимит',
            },
          }
        ));
      } else if (limits.vat_required) {
        checks.push(problemCheck(
          id, LEVEL, CATEGORY, 'warning',
          `НДС для УСН: ${company.name}`,
          `Выручка превысила 20 млн ₽. НДС ${(limits.vat_rate * 100).toFixed(0)}%`,
          {
            entity: { type: 'company', id: company.id, name: company.name },
            count: 1,
            details: { limits },
            recommendation: 'Начните учитывать НДС',
            display: {
              type: 'progress_bar',
              title: 'Порог НДС (20 млн)',
              percent: limits.limits.exempt.used_percent,
              threshold: limits.limits.exempt.threshold,
              threshold_label: `НДС ${(limits.vat_rate * 100).toFixed(0)}%`,
            },
          }
        ));
      } else {
        checks.push(okCheck(
          id, LEVEL, CATEGORY,
          `Лимиты УСН: ${company.name}`,
          `Выручка ${limits.current_revenue.toLocaleString('ru-RU')} ₽ (${limits.limits.exempt.used_percent}% от порога НДС)`
        ));
      }
    } catch (e: any) {
      checks.push(problemCheck(
        id, LEVEL, CATEGORY, 'warning',
        `Лимиты УСН: ${company.name}`,
        `Ошибка: ${e.message}`,
        {
          entity: { type: 'company', id: company.id, name: company.name },
          reason: e.message,
        }
      ));
    }
  }

  return checks;
}

// ============================================
// 5.2 Кассовые разрывы (прогноз 90 дней)
// ============================================
async function checkCashGaps(ctx: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const id = 'cash_gaps';
  const HORIZON_DAYS = 90;

  try {
    const settings = ctx.settings
      ? Object.entries(ctx.settings).map(([key, value]) => ({ key, value }))
      : [];

    const forecast = await cashflowForecastEngine.forecast({
      transactions: ctx.transactions,
      accounts: ctx.accounts,
      companies: ctx.companies,
      budgets: ctx.budgets,
      settings,
      start_date: ctx.today,
      horizon_days: HORIZON_DAYS,
      company_id: null,
      include_plan: true,
    });

    const gaps = forecast.consolidated.gaps;

    if (gaps.length === 0) {
      return [okCheck(
        id, LEVEL, CATEGORY,
        'Кассовые разрывы',
        `Кассовых разрывов нет за ${HORIZON_DAYS} дней (остаток: ${forecast.consolidated.starting_balance.toLocaleString('ru-RU')} ₽ → ${forecast.consolidated.ending_balance.toLocaleString('ru-RU')} ₽)`,
      )];
    }

    const totalDeficit = gaps.reduce((s, g) => s + g.max_deficit, 0);

    // Собираем причины из первого разрыва
    const firstGap = gaps[0];
    const detailsLines = gaps.slice(0, 5).map(g =>
      `${g.date} — ${g.end_date} (${g.duration_days} дн.), макс. −${Math.round(g.max_deficit).toLocaleString('ru-RU')} ₽`,
    );

    return [problemCheck(
      id, LEVEL, CATEGORY, 'critical',
      'Кассовые разрывы',
      `${gaps.length} кассовых разрывов в прогнозе на ${HORIZON_DAYS} дней`,
      {
        count: gaps.length,
        details: {
          gaps: gaps.slice(0, 10),
          total_deficit: totalDeficit,
          first_gap_reasons: firstGap.reasons,
          start_date: ctx.today,
          horizon_days: HORIZON_DAYS,
        },
        reason: 'Прогнозный остаток становится отрицательным',
        recommendation: 'Перенесите платежи, ускорьте сбор дебиторки или привлеките краткосрочное финансирование',
        display: {
          type: 'list',
          items: [
            { label: 'Разрывов', value: String(gaps.length), color: 'red' as const },
            { label: 'Макс. дефицит', value: `−${Math.round(totalDeficit).toLocaleString('ru-RU')} ₽`, color: 'red' as const },
            ...gaps.slice(0, 3).map(g => ({
              label: g.date,
              value: `−${Math.round(g.max_deficit).toLocaleString('ru-RU')} ₽`,
              color: 'red' as const,
            })),
          ],
        },
      },
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'warning',
      'Кассовые разрывы',
      `Ошибка: ${e.message}`,
      { reason: e.message },
    )];
  }
}

// ============================================
// 5.3 Рентабельность
// ============================================
function checkProfitability(ctx: DiagnosticContext): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  for (const company of ctx.companies) {
    const id = `profitability_${company.id}`;
    try {
      const pnl = calculator.calculatePnL(
        ctx.transactions, ctx.accounts, company.id,
        ctx.periodStart, ctx.periodEnd, company
      );

      const margin = pnl.revenue > 0 ? (pnl.net_profit / pnl.revenue) * 100 : 0;

      if (margin < -20) {
        checks.push(problemCheck(
          id, LEVEL, CATEGORY, 'warning',
          `Убыточность: ${company.name}`,
          `Убыток ${margin.toFixed(1)}% (${pnl.net_profit.toLocaleString('ru-RU')} ₽)`,
          {
            entity: { type: 'company', id: company.id, name: company.name },
            details: { revenue: pnl.revenue, net_profit: pnl.net_profit, margin },
            reason: 'Убыток больше 20% от выручки',
            recommendation: 'Проанализируйте структуру расходов',
          }
        ));
      } else {
        checks.push(okCheck(
          id, LEVEL, CATEGORY,
          `Рентабельность: ${company.name}`,
          `${margin.toFixed(1)}% (прибыль ${pnl.net_profit.toLocaleString('ru-RU')} ₽)`
        ));
      }
    } catch (e: any) {
      checks.push(problemCheck(
        id, LEVEL, CATEGORY, 'warning',
        `Рентабельность: ${company.name}`,
        `Ошибка: ${e.message}`,
        { reason: e.message }
      ));
    }
  }

  return checks;
}

// ============================================
// 5.4 Дебиторка / Кредиторка
// ============================================
function checkARAP(ctx: DiagnosticContext): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  const arAcc = ctx.systemAccounts?.ar || 'acc-ar-001';
  const apAcc = ctx.systemAccounts?.ap || 'acc-ap-001';

  const ar = ctx.transactions
    .filter(t => t.debit_account_id === arAcc)
    .reduce((s, t) => s + parseFloat(String(t.amount_rub || 0)), 0)
    - ctx.transactions
      .filter(t => t.credit_account_id === arAcc)
      .reduce((s, t) => s + parseFloat(String(t.amount_rub || 0)), 0);

  const ap = ctx.transactions
    .filter(t => t.credit_account_id === apAcc)
    .reduce((s, t) => s + parseFloat(String(t.amount_rub || 0)), 0)
    - ctx.transactions
      .filter(t => t.debit_account_id === apAcc)
      .reduce((s, t) => s + parseFloat(String(t.amount_rub || 0)), 0);

  if (ar > 1000000) {
    checks.push(problemCheck(
      'ar_balance', LEVEL, CATEGORY, 'warning',
      'Дебиторская задолженность',
      `Дебиторка: ${ar.toLocaleString('ru-RU')} ₽`,
      {
        details: { balance: ar },
        recommendation: 'Проверьте просроченную дебиторку',
        display: {
          type: 'key_value',
          items: [{ label: 'Дебиторская задолженность', value: `${ar.toLocaleString('ru-RU')} ₽`, bold: true }],
        },
      }
    ));
  } else if (ar > 0) {
    checks.push(okCheck('ar_balance', LEVEL, CATEGORY, 'Дебиторская задолженность', `${ar.toLocaleString('ru-RU')} ₽`));
  } else {
    checks.push(okCheck('ar_balance', LEVEL, CATEGORY, 'Дебиторская задолженность', 'Дебиторки нет'));
  }

  if (ap > 1000000) {
    checks.push(problemCheck(
      'ap_balance', LEVEL, CATEGORY, 'warning',
      'Кредиторская задолженность',
      `Кредиторка: ${ap.toLocaleString('ru-RU')} ₽`,
      {
        details: { balance: ap },
        recommendation: 'Проверьте сроки оплаты',
        display: {
          type: 'key_value',
          items: [{ label: 'Кредиторская задолженность', value: `${ap.toLocaleString('ru-RU')} ₽`, bold: true }],
        },
      }
    ));
  } else if (ap > 0) {
    checks.push(okCheck('ap_balance', LEVEL, CATEGORY, 'Кредиторская задолженность', `${ap.toLocaleString('ru-RU')} ₽`));
  } else {
    checks.push(okCheck('ap_balance', LEVEL, CATEGORY, 'Кредиторская задолженность', 'Кредиторки нет'));
  }

  return checks;
}
// ============================================
// 5.5 Сходимость налогов: начислено vs уплачено
// ============================================
function checkTaxConsistency(ctx: DiagnosticContext): DiagnosticCheck[] {
  const id = 'tax_consistency';
  try {
    const currentYear = new Date().getFullYear().toString();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;

    // 1. Начислено через taxEngine (по каждой компании)
    let totalAccrued = 0;
    const accruedByCompany: Record<string, number> = {};

    for (const company of ctx.companies) {
      try {
        const taxCalc = taxEngine.calculateTax(
          company,
          ctx.transactions,
          ctx.accounts,
          yearStart,
          yearEnd,
        );
        const total =
          (taxCalc.income_tax_amount || 0) +
          (taxCalc.insurance_amount || 0) +
          (taxCalc.ndfl_amount || 0) +
          (taxCalc.vat_to_pay || 0);
        accruedByCompany[company.id] = total;
        totalAccrued += total;
      } catch (e) {
        // Пропускаем компании с ошибкой расчёта
      }
    }

    // 2. Уплачено по факт-транзакциям acc-tax-*
    let totalPaid = 0;
    const paidByCompany: Record<string, number> = {};

    for (const t of ctx.transactions) {
      const txDate = String(t.date).split('T')[0];
      if (txDate < yearStart || txDate > yearEnd) continue;
      if (t.record_type !== 'fact') continue;
      if (!String(t.debit_account_id || '').startsWith('acc-tax-')) continue;
      if (String(t.is_deleted || '') === 'true') continue;

      const amount = parseFloat(String(t.amount_rub || t.amount || 0));
      const companyId = t.company_id || '';
      paidByCompany[companyId] = (paidByCompany[companyId] || 0) + amount;
      totalPaid += amount;
    }

    // 3. Сравнение
    const diff = Math.abs(totalAccrued - totalPaid);
    const diffPercent = totalAccrued > 0 ? (diff / totalAccrued) * 100 : 0;

    // Считаем план — ещё не оплачено
    let totalPlanned = 0;
    for (const t of ctx.transactions) {
      const txDate = String(t.date).split('T')[0];
      if (txDate < yearStart || txDate > yearEnd) continue;
      if (t.record_type !== 'plan') continue;
      if (!String(t.debit_account_id || '').startsWith('acc-tax-')) continue;
      if (String(t.is_deleted || '') === 'true') continue;

      const amount = parseFloat(String(t.amount_rub || t.amount || 0));
      totalPlanned += amount;
    }

    // Порог 20%
    if (totalAccrued > 0 && diffPercent > 20) {
      // Детализация по компаниям
      const companiesWithDiff: Array<{
        company_id: string;
        company_name: string;
        accrued: number;
        paid: number;
        diff: number;
        diff_percent: number;
      }> = [];

      for (const company of ctx.companies) {
        const accrued = accruedByCompany[company.id] || 0;
        const paid = paidByCompany[company.id] || 0;
        const d = Math.abs(accrued - paid);
        const dp = accrued > 0 ? (d / accrued) * 100 : 0;
        if (dp > 10) {
          companiesWithDiff.push({
            company_id: company.id,
            company_name: company.name,
            accrued: Math.round(accrued * 100) / 100,
            paid: Math.round(paid * 100) / 100,
            diff: Math.round(d * 100) / 100,
            diff_percent: Math.round(dp * 10) / 10,
          });
        }
      }

      return [problemCheck(
        id, LEVEL, CATEGORY, 'warning',
        'Сходимость налогов',
        `Начислено ${Math.round(totalAccrued).toLocaleString('ru-RU')} ₽ vs уплачено ${Math.round(totalPaid).toLocaleString('ru-RU')} ₽ (расхождение ${diffPercent.toFixed(1)}%)`,
        {
          count: companiesWithDiff.length,
          details: {
            total_accrued: totalAccrued,
            total_paid: totalPaid,
            total_planned: totalPlanned,
            diff,
            diff_percent: diffPercent,
            by_company: companiesWithDiff,
          },
          reason: 'Сумма уплаченных налогов (acc-tax-*) расходится с расчётом taxEngine более чем на 10%',
          recommendation: 'Проверьте, все ли налоги заведены транзакциями. Если часть налогов не оплачена — это нормально, но требует внимания.',
          display: {
            type: 'key_value',
            items: [
              { label: 'Начислено (расчёт)', value: `${Math.round(totalAccrued).toLocaleString('ru-RU')} ₽` },
              { label: 'Уплачено (факт)', value: `${Math.round(totalPaid).toLocaleString('ru-RU')} ₽`, color: 'yellow' as const },
              { label: 'Расхождение', value: `${diffPercent.toFixed(1)}%`, color: 'yellow' as const },
              { label: 'Отложено (plan)', value: `${Math.round(totalPlanned).toLocaleString('ru-RU')} ₽`, color: 'yellow' as const },
            ],
          },
        }
      )];
    }

    return [okCheck(
      id, LEVEL, CATEGORY,
      'Сходимость налогов',
      `Начислено ${Math.round(totalAccrued).toLocaleString('ru-RU')} ₽ ≈ уплачено ${Math.round(totalPaid).toLocaleString('ru-RU')} ₽`,
    )];
  } catch (e: any) {
    return [problemCheck(
      id, LEVEL, CATEGORY, 'warning',
      'Сходимость налогов',
      `Ошибка: ${e.message}`,
      { reason: e.message },
    )];
  }
}
