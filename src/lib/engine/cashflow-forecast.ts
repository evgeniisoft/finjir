/**
 * ============================================
 * FinEngine 2026 - Прогноз кассовых разрывов
 * ============================================
 * Единый движок прогноза денежного потока.
 *
 * Логика:
 *  1. Стартовый остаток — cash на start_date (из calculateBalanceSheet).
 *  2. Собираем будущие транзакции (fact + plan) с учётом is_cash_flow.
 *  3. Налоги — уже в Transactions (source='calculated'), обрабатываются
 *     как обычные транзакции.
 *  4. Идём по дням, обновляем running balance.
 *  5. Фиксируем разрывы (balance < 0) с причинами.
 *  6. Возвращаем консолидированно + по компаниям.
 *
 * Ключевые правила:
 *  - Классификация доход/расход — через is_cash_flow счётов, НЕ через type.
 *  - Переводы (оба счёта is_cash_flow) — нетто-эффект 0 → игнорируем.
 *  - payment_delay_days применяется ТОЛЬКО к операционным счетам (в /planning).
 */

import { calculator } from './calculator';

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
}

export interface ForecastItem {
  id: string;
  date: string;
  description: string;
  amount: number;
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

// ============================================
// Основной движок
// ============================================

export class CashflowForecastEngine {

  async forecast(params: ForecastParams): Promise<ForecastResult> {
    const {
      transactions, accounts, companies, budgets,
      start_date, horizon_days,
      include_plan = true,
    } = params;

    const end_date = addDays(start_date, horizon_days - 1);

    // Целевые компании
    const targetCompanies = params.company_id
      ? companies.filter(c => c.id === params.company_id)
      : companies;

    // ============================================
    // Консолидированный прогноз
    // ============================================
    const consolidatedDays = this.buildDays({
      transactions, accounts, companies: targetCompanies, budgets,
      start_date, end_date,
      include_plan,
    });

    // ============================================
    // По каждой компании
    // ============================================
    const byCompany = targetCompanies.map(company => {
      const days = this.buildDays({
        transactions, accounts, companies: [company], budgets,
        start_date, end_date,
        include_plan,
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
  }): ForecastDay[] {
    const {
      transactions, accounts, companies,
      start_date, end_date,
      include_plan,
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
    // 2. Собираем будущие items (включая налоги)
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

      // Определяем тип item
      let itemType: 'transaction' | 'tax' = 'transaction';
      if (String(categoryAcc.id).startsWith('acc-tax-')) {
        itemType = 'tax';
      }

      items.push({
        id: t.id,
        date: txDate,
        description: t.description || '(без описания)',
        amount: sign * amount,
        direction,
        type: itemType,
        account_id: categoryAcc.id,
        account_name: categoryAcc.name,
        company_id: t.company_id,
        company_name: company?.name || '',
        source: recordType as 'fact' | 'plan',
        record_type: recordType,
      });
    }

    // ============================================
    // 3. Сортируем по дате
    // ============================================
    items.sort((a, b) => a.date.localeCompare(b.date));

    // ============================================
    // 4. Группируем по дням
    // ============================================
    const itemsByDate = new Map<string, ForecastItem[]>();
    for (const item of items) {
      if (!itemsByDate.has(item.date)) itemsByDate.set(item.date, []);
      itemsByDate.get(item.date)!.push(item);
    }

    // ============================================
    // 5. Строим дни
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
