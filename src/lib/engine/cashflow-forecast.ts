/**
 * ============================================
 * FinEngine 2026 - Прогноз кассовых разрывов
 * ============================================
 * Единый движок прогноза денежного потока.
 *
 * Логика:
 *  1. Стартовый остаток — cash на start_date (из calculateBalanceSheet).
 *  2. Собираем будущие транзакции (fact + plan) с учётом is_cash_flow.
 *  3. Добавляем налоги по календарю (tax_payment_days).
 *  4. Идём по дням, обновляем running balance.
 *  5. Фиксируем разрывы (balance < 0) с причинами.
 *  6. Возвращаем консолидированно + по компаниям.
 *
 * Ключевые правила:
 *  - Классификация доход/расход — через is_cash_flow счётов, НЕ через type.
 *  - Переводы (оба счёта is_cash_flow) — нетто-эффект 0 → игнорируем.
 *  - Налоги привязываются к дате через tax_payment_days (день месяца).
 *  - Налоги за прошлый месяц/квартал — сдвиг на 1 месяц/квартал вперёд.
 *  - payment_delay_days применяется ТОЛЬКО к операционным счетам.
 */

import { calculator } from './calculator';
import { taxEngine } from './tax';
import {
  getAllTaxPaymentDays,
  TaxType,
} from '@/lib/utils/tax-payment-days';

// ============================================
// Типы
// ============================================

export interface ForecastParams {
  transactions: any[];
  accounts: any[];
  companies: any[];
  budgets: any[];
  settings: any[];
  start_date: string;      // "2026-09-30"
  horizon_days: number;    // 30, 90, 365
  company_id?: string | null;
  include_plan?: boolean;
  include_taxes?: boolean;
}

export interface ForecastItem {
  id: string;
  date: string;
  description: string;
  amount: number;          // со знаком: + для inflow, − для outflow
  direction: 'inflow' | 'outflow';
  type: 'transaction' | 'tax' | 'transfer';
  account_id: string;
  account_name: string;
  company_id: string;
  company_name: string;
  source: 'fact' | 'plan' | 'calculated';
  record_type?: string;
}

export interface ForecastDay {
  date: string;
  balance_start: number;
  inflow: number;
  outflow: number;
  balance_end: number;
  is_gap: boolean;
  gap_amount: number;
  items: ForecastItem[];
}

export interface ForecastGap {
  date: string;
  end_date: string;
  duration_days: number;
  max_deficit: number;
  reasons: ForecastItem[];
  recommendations: string[];
}

export interface ForecastResult {
  params: {
    start_date: string;
    end_date: string;
    horizon_days: number;
    company_id: string | null;
    include_plan: boolean;
    include_taxes: boolean;
  };
  consolidated: {
    days: ForecastDay[];
    gaps: ForecastGap[];
    starting_balance: number;
    ending_balance: number;
    total_inflow: number;
    total_outflow: number;
  };
  by_company: Array<{
    company_id: string;
    company_name: string;
    days: ForecastDay[];
    gaps: ForecastGap[];
    starting_balance: number;
    ending_balance: number;
    total_inflow: number;
    total_outflow: number;
  }>;
}

// ============================================
// Вспомогательные
// ============================================

function getDateStr(date: any): string {
  if (!date) return '';
  if (typeof date === 'string') return date.split('T')[0];
  if (date instanceof Date) return date.toISOString().split('T')[0];
  return String(date).split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const MONTH_NAMES_RU_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

function formatMonthRu(month: string): string {
  // month = "2026-09"
  const [y, m] = month.split('-');
  const idx = parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${MONTH_NAMES_RU_SHORT[idx]} ${y}`;
}

/**
 * Дата уплаты налога: следующий месяц(ы) после месяца начисления,
 * указанный день (или последний день месяца, если дня нет).
 */
function getTaxPaymentDate(
  accrualMonth: string,
  paymentDay: number,
  monthsShift: number,
): string {
  const [yearStr, monthStr] = accrualMonth.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + monthsShift;

  while (month > 12) {
    month -= 12;
    year += 1;
  }

  const lastDay = getLastDayOfMonth(year, month);
  const day = Math.min(paymentDay, lastDay);

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ============================================
// Основной движок
// ============================================

export class CashflowForecastEngine {

  async forecast(params: ForecastParams): Promise<ForecastResult> {
    const {
      transactions, accounts, companies, budgets, settings,
      start_date, horizon_days,
      include_plan = true,
      include_taxes = true,
    } = params;

    const end_date = addDays(start_date, horizon_days - 1);

    // Загружаем настройки в taxEngine (для корректного расчёта налогов)
    await taxEngine.loadSettings(settings);

    // Целевые компании
    const targetCompanies = params.company_id
      ? companies.filter(c => c.id === params.company_id)
      : companies;

    // Дни уплаты налогов
    const taxDays = getAllTaxPaymentDays(settings);

    // ============================================
    // Консолидированный прогноз
    // ============================================
    const consolidatedDays = this.buildDays({
      transactions, accounts, companies: targetCompanies, budgets,
      start_date, end_date,
      include_plan, include_taxes,
      taxDays,
    });

    // ============================================
    // По каждой компании
    // ============================================
    const byCompany = targetCompanies.map(company => {
      const days = this.buildDays({
        transactions, accounts, companies: [company], budgets,
        start_date, end_date,
        include_plan, include_taxes,
        taxDays,
      });
      const startingBalance = days.length > 0 ? days[0].balance_start : 0;
      const endingBalance = days.length > 0 ? days[days.length - 1].balance_end : 0;
      const totalInflow = days.reduce((s, d) => s + d.inflow, 0);
      const totalOutflow = days.reduce((s, d) => s + d.outflow, 0);

      return {
        company_id: company.id,
        company_name: company.name,
        days,
        gaps: this.extractGaps(days),
        starting_balance: startingBalance,
        ending_balance: endingBalance,
        total_inflow: totalInflow,
        total_outflow: totalOutflow,
      };
    });

    const consolidatedStarting = consolidatedDays.length > 0 ? consolidatedDays[0].balance_start : 0;
    const consolidatedEnding = consolidatedDays.length > 0 ? consolidatedDays[consolidatedDays.length - 1].balance_end : 0;
    const consolidatedInflow = consolidatedDays.reduce((s, d) => s + d.inflow, 0);
    const consolidatedOutflow = consolidatedDays.reduce((s, d) => s + d.outflow, 0);

    return {
      params: {
        start_date,
        end_date,
        horizon_days,
        company_id: params.company_id || null,
        include_plan,
        include_taxes,
      },
      consolidated: {
        days: consolidatedDays,
        gaps: this.extractGaps(consolidatedDays),
        starting_balance: consolidatedStarting,
        ending_balance: consolidatedEnding,
        total_inflow: consolidatedInflow,
        total_outflow: consolidatedOutflow,
      },
      by_company: byCompany,
    };
  }

  // ============================================
  // Построение массива дней
  // ============================================

  private buildDays(args: {
    transactions: any[];
    accounts: any[];
    companies: any[];
    budgets: any[];
    start_date: string;
    end_date: string;
    include_plan: boolean;
    include_taxes: boolean;
    taxDays: Record<TaxType, number>;
  }): ForecastDay[] {
    const {
      transactions, accounts, companies, budgets,
      start_date, end_date,
      include_plan, include_taxes,
      taxDays,
    } = args;

    const companyIds = new Set(companies.map(c => c.id));

    // ============================================
    // 1. Стартовый остаток
    // ============================================
    let startingBalance = 0;
    for (const company of companies) {
      const bs = calculator.calculateBalanceSheet(
        transactions, accounts, company.id, start_date, company,
      );
      startingBalance += bs.assets.cash;
    }

    // ============================================
    // 2. Собираем будущие items
    // ============================================
    const items: ForecastItem[] = [];

    const accountById = new Map(accounts.map(a => [a.id, a]));
    const companyById = new Map(companies.map(c => [c.id, c]));

    for (const t of transactions) {
      if (!companyIds.has(t.company_id)) continue;

      const recordType = t.record_type || 'fact';
      if (recordType === 'plan' && !include_plan) continue;

      const txDate = getDateStr(t.date);
      if (txDate < start_date || txDate > end_date) continue;

      const debitAcc = accountById.get(t.debit_account_id);
      const creditAcc = accountById.get(t.credit_account_id);
      if (!debitAcc || !creditAcc) continue;

      const debitIsCash = Boolean(debitAcc.is_cash_flow);
      const creditIsCash = Boolean(creditAcc.is_cash_flow);

      // Оба денежные — перевод. Нетто 0. Игнорируем.
      if (debitIsCash && creditIsCash) continue;

      // Оба не денежные — не влияет на cash.
      if (!debitIsCash && !creditIsCash) continue;

      const amount = parseFloat(String(t.amount_rub || t.amount || 0));
      if (amount === 0) continue;

      const company = companyById.get(t.company_id);
      const isInflow = debitIsCash && !creditIsCash;
      const direction: 'inflow' | 'outflow' = isInflow ? 'inflow' : 'outflow';
      const sign = isInflow ? 1 : -1;

      const categoryAcc = isInflow ? creditAcc : debitAcc;

      items.push({
        id: t.id,
        date: txDate,
        description: t.description || '(без описания)',
        amount: sign * amount,
        direction,
        type: 'transaction',
        account_id: categoryAcc.id,
        account_name: categoryAcc.name,
        company_id: t.company_id,
        company_name: company?.name || '',
        source: recordType as 'fact' | 'plan',
        record_type: recordType,
      });
    }

    // ============================================
    // 3. Налоги
    // ============================================
    if (include_taxes) {
      const taxItems = this.buildTaxItems({
        transactions, accounts, companies, budgets,
        start_date, end_date,
        taxDays,
      });
      items.push(...taxItems);
    }

    // ============================================
    // 4. Сортируем по дате
    // ============================================
    items.sort((a, b) => a.date.localeCompare(b.date));

    // ============================================
    // 5. Группируем по дням
    // ============================================
    const itemsByDate = new Map<string, ForecastItem[]>();
    for (const item of items) {
      if (!itemsByDate.has(item.date)) itemsByDate.set(item.date, []);
      itemsByDate.get(item.date)!.push(item);
    }

    // ============================================
    // 6. Строим дни
    // ============================================
    const days: ForecastDay[] = [];
    let balance = startingBalance;

    let currentDate = start_date;
    while (currentDate <= end_date) {
      const dayItems = itemsByDate.get(currentDate) || [];
      const inflow = dayItems
        .filter(i => i.direction === 'inflow')
        .reduce((s, i) => s + i.amount, 0);
      const outflow = dayItems
        .filter(i => i.direction === 'outflow')
        .reduce((s, i) => s + Math.abs(i.amount), 0);

      const balanceStart = balance;
      balance = balanceStart + inflow - outflow;

      days.push({
        date: currentDate,
        balance_start: balanceStart,
        inflow,
        outflow,
        balance_end: balance,
        is_gap: balance < 0,
        gap_amount: balance < 0 ? Math.abs(balance) : 0,
        items: dayItems,
      });

      currentDate = addDays(currentDate, 1);
    }

    return days;
  }

  // ============================================
  // Налоги
  // ============================================

  private buildTaxItems(args: {
    transactions: any[];
    accounts: any[];
    companies: any[];
    budgets: any[];
    start_date: string;
    end_date: string;
    taxDays: Record<TaxType, number>;
  }): ForecastItem[] {
    const { transactions, accounts, companies, budgets, start_date, end_date, taxDays } = args;
    const items: ForecastItem[] = [];

    // Список месяцев, покрывающих прогноз.
    // ВАЖНО: сдвигаемся на 3 месяца НАЗАД — чтобы поймать налоги за прошлый
    // квартал/месяц, которые платятся в месяце прогноза.
    // Пример: прогноз с 01.10.2026, налоги за Q3 (июль-сентябрь) платятся
    //         28.10.2026 → в прогнозе.
    const startMonth = start_date.substring(0, 7);
    const endMonth = end_date.substring(0, 7);
    const months: string[] = [];
    {
      let [y, m] = startMonth.split('-').map(Number);
      // Сдвиг на 3 месяца назад
      m -= 3;
      while (m < 1) { m += 12; y -= 1; }

      const [ey, em] = endMonth.split('-').map(Number);
      while (y < ey || (y === ey && m <= em)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
      }
    }

    for (const company of companies) {
      for (const month of months) {
        const monthStart = `${month}-01`;
        const [yy, mm] = month.split('-').map(Number);
        const lastDay = getLastDayOfMonth(yy, mm);
        const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

        const taxCalc = taxEngine.calculateTax(
          company, transactions, accounts, monthStart, monthEnd,
        );

        // Ежемесячные налоги → платятся в СЛЕДУЮЩЕМ месяце после расчётного.
        // В лейбле указываем расчётный месяц для прозрачности.
        if (taxCalc.insurance_amount > 0) {
          const payDate = getTaxPaymentDate(month, taxDays.insurance, 1);
          if (payDate >= start_date && payDate <= end_date) {
            items.push(this.makeTaxItem(
              company, payDate, `Страховые взносы (за ${formatMonthRu(month)})`,
              taxCalc.insurance_amount, 'acc-tax-insurance',
            ));
          }
        }
        if (taxCalc.ndfl_amount > 0) {
          const payDate = getTaxPaymentDate(month, taxDays.ndfl, 1);
          if (payDate >= start_date && payDate <= end_date) {
            items.push(this.makeTaxItem(
              company, payDate, `НДФЛ (за ${formatMonthRu(month)})`,
              taxCalc.ndfl_amount, 'acc-tax-ndfl',
            ));
          }
        }

        // Квартальные — только в конце квартала.
        // Накопительный расчёт: 
        //   Q1 = calc(yearStart, 31.03)
        //   Q2 = calc(yearStart, 30.06) − Q1
        //   Q3 = calc(yearStart, 30.09) − Q1 − Q2
        //   Q4 = calc(yearStart, 31.12) − Q1 − Q2 − Q3
        // Так сумма за год совпадает с годовым расчётом.
        const isQuarterEnd = mm === 3 || mm === 6 || mm === 9 || mm === 12;
        if (isQuarterEnd) {
          const yearStart = `${yy}-01-01`;

          // Накопительные расчёты до конца каждого квартала
          const cumulativeTaxes: any[] = [];
          for (const qEndMonth of [3, 6, 9, 12]) {
            if (qEndMonth > mm) break;
            const qLastDay = getLastDayOfMonth(yy, qEndMonth);
            const qEnd = `${yy}-${String(qEndMonth).padStart(2, '0')}-${String(qLastDay).padStart(2, '0')}`;
            cumulativeTaxes.push(
              taxEngine.calculateTax(company, transactions, accounts, yearStart, qEnd),
            );
          }

          // Текущий квартал = накопительный до конца квартала
          //                   − накопительный до конца ПРЕДЫДУЩЕГО квартала.
          const cumulativeCurrent = cumulativeTaxes[cumulativeTaxes.length - 1];
          const cumulativePrev = cumulativeTaxes.length > 1
            ? cumulativeTaxes[cumulativeTaxes.length - 2]
            : { vat_to_pay: 0, income_tax_amount: 0 };

          const quarterVat = Math.max(0, cumulativeCurrent.vat_to_pay - cumulativePrev.vat_to_pay);
          const quarterIncomeTax = Math.max(0, cumulativeCurrent.income_tax_amount - cumulativePrev.income_tax_amount);

          if (quarterVat > 0) {
            const payDate = getTaxPaymentDate(month, taxDays.vat, 1);
            if (payDate >= start_date && payDate <= end_date) {
              items.push(this.makeTaxItem(
                company, payDate, 'НДС (за квартал)',
                quarterVat, 'acc-tax-vat',
              ));
            }
          }

          if (quarterIncomeTax > 0) {
            const isOsno = company.tax_system === 'OSNO';
            const label = isOsno
              ? 'Налог на прибыль (за квартал)'
              : 'Налог УСН (за квартал)';
            const accId = isOsno ? 'acc-tax-profit' : 'acc-tax-usn';
            const day = isOsno ? taxDays.profit : taxDays.usn;
            const payDate = getTaxPaymentDate(month, day, 1);
            if (payDate >= start_date && payDate <= end_date) {
              items.push(this.makeTaxItem(
                company, payDate, label,
                quarterIncomeTax, accId,
              ));
            }
          }
        }

        // Фикс. взносы ИП — декабрь
        if (mm === 12 && company.is_individual && taxCalc.ip_fixed_amount > 0) {
          const payDate = getTaxPaymentDate(month, taxDays.ip_fixed, 0);
          if (payDate >= start_date && payDate <= end_date) {
            items.push(this.makeTaxItem(
              company, payDate, 'Фикс. взносы ИП',
              taxCalc.ip_fixed_amount, 'acc-tax-ip',
            ));
          }
        }
      }
    }

    return items;
  }

  private makeTaxItem(
    company: any, date: string, label: string, amount: number, accountId: string,
  ): ForecastItem {
    return {
      id: `tax-${company.id}-${date}-${accountId}`,
      date,
      description: label,
      amount: -Math.abs(amount),
      direction: 'outflow',
      type: 'tax',
      account_id: accountId,
      account_name: label,
      company_id: company.id,
      company_name: company.name,
      source: 'calculated',
      record_type: 'plan',
    };
  }

  // ============================================
  // Разрывы
  // ============================================

  private extractGaps(days: ForecastDay[]): ForecastGap[] {
    const gaps: ForecastGap[] = [];
    let i = 0;
    while (i < days.length) {
      if (!days[i].is_gap) { i++; continue; }

      const startIdx = i;
      let maxDeficit = days[i].gap_amount;
      let endIdx = i;
      while (endIdx + 1 < days.length && days[endIdx + 1].is_gap) {
        endIdx++;
        maxDeficit = Math.max(maxDeficit, days[endIdx].gap_amount);
      }

      const reasons = days[startIdx].items
        .filter(it => it.direction === 'outflow')
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 5);

      gaps.push({
        date: days[startIdx].date,
        end_date: days[endIdx].date,
        duration_days: endIdx - startIdx + 1,
        max_deficit: maxDeficit,
        reasons,
        recommendations: this.buildRecommendations(days, startIdx, endIdx, reasons),
      });

      i = endIdx + 1;
    }
    return gaps;
  }

  private buildRecommendations(
    days: ForecastDay[], startIdx: number, endIdx: number, reasons: ForecastItem[],
  ): string[] {
    const recs: string[] = [];
    const duration = endIdx - startIdx + 1;

    const bigOutflows = reasons.filter(r => Math.abs(r.amount) > 100_000);
    if (bigOutflows.length > 0) {
      // Группируем по компании — чтобы видеть, откуда основная нагрузка
      const grouped: Record<string, ForecastItem[]> = {};
      for (const r of bigOutflows) {
        const key = r.company_name || 'Без компании';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      }

      const parts: string[] = [];
      for (const [companyName, items] of Object.entries(grouped)) {
        const total = items.reduce((s, it) => s + Math.abs(it.amount), 0);
        const labels = items.map(it => it.description).join(', ');
        parts.push(`${companyName} — ${labels} (${Math.round(total).toLocaleString('ru-RU')} ₽)`);
      }

      recs.push(`Перенести крупные платежи: ${parts.join('; ')}.`);
    }

    if (duration > 3) {
      recs.push(
        `Разрыв длится ${duration} дн. Рассмотреть краткосрочный кредит или факторинг.`,
      );
    }

    if (days[startIdx].inflow === 0) {
      recs.push('В день начала разрыва нет поступлений. Ускорить сбор дебиторки.');
    }

    if (recs.length === 0) {
      recs.push('Проверьте календарь платежей — возможно, часть можно сдвинуть.');
    }
    return recs;
  }
}

export const cashflowForecastEngine = new CashflowForecastEngine();
