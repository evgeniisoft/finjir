/**
 * ============================================
 * FinEngine 2026 - Tax Scheduler
 * ============================================
 * Генерирует факт/план-транзакции по налогам.
 *
 * Логика:
 *  1. Ежемесячные (страховые, НДФЛ):
 *     - для компаний с has_employees=true.
 *     - ставка: taxEngine.calculateTax за месяц.
 *     - дата: day в следующем месяце.
 *  2. Квартальные (НДС, УСН, прибыль):
 *     - НДС: vat_included=true (OSNO).
 *     - УСН: tax_system IN (USN_6, USN_15).
 *     - Прибыль: tax_system = OSNO.
 *     - НАКОПИТЕЛЬНЫЙ расчёт:
 *       Q1 = cum(Q1)
 *       Q2 = cum(Q2) − cum(Q1)
 *       Q3 = cum(Q3) − cum(Q2)
 *       Q4 = cum(Q4) − cum(Q3)
 *  3. Фикс. взносы ИП:
 *     - для is_individual=true.
 *     - дата: 28.12 года.
 *     - сумма: ip_fixed_contribution.
 *
 * Дедупликация по import_hash.
 * record_type = fact, если дата ≤ today, иначе plan.
 */

import { taxEngine } from './tax';

export interface TaxPaymentSpec {
  id: string;                  // пустой — генерируется репозиторием
  date: string;                // "2026-10-28"
  description: string;
  amount: number;
  amount_rub: number;
  currency: 'RUB';
  type: 'expense';
  company_id: string;
  debit_account_id: string;
  credit_account_id: string;
  record_type: 'fact' | 'plan';
  source: 'calculated';
  import_hash: string;
  // Служебные
  tax_type: 'usn' | 'vat' | 'profit' | 'insurance' | 'ndfl' | 'ip_fixed';
}

export interface GenerateParams {
  start_year: number;
  end_year: number;
  today: string;                       // "2026-10-01"
  tax_payment_days: Record<string, number>;
  ip_fixed_contribution: number;       // 57390
  credit_account_id: string;           // "acc-bank-001"
}

export interface GenerateData {
  transactions: any[];
  accounts: any[];
  companies: any[];
  existing_taxes: any[];
}

export interface GenerateResult {
  to_create: TaxPaymentSpec[];
  to_skip: Array<{ reason: string; spec: Partial<TaxPaymentSpec> }>;
  summary: {
    total: number;
    fact: number;
    plan: number;
    by_company: Record<string, { count: number; amount: number }>;
    by_tax: Record<string, { count: number; amount: number }>;
  };
  divergences: Array<{ message: string; company_id?: string }>;
}

const TAX_ACCOUNTS: Record<string, string> = {
  usn: 'acc-tax-usn',
  vat: 'acc-tax-vat',
  profit: 'acc-tax-profit',
  insurance: 'acc-tax-insurance',
  ndfl: 'acc-tax-ndfl',
  ip_fixed: 'acc-tax-ip',
};

const TAX_LABELS: Record<string, string> = {
  usn: 'Налог УСН',
  vat: 'НДС',
  profit: 'Налог на прибыль',
  insurance: 'Страховые взносы',
  ndfl: 'НДФЛ',
  ip_fixed: 'Фикс. взносы ИП',
};

const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_RU_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getPaymentDate(year: number, month: number, day: number): string {
  const lastDay = getLastDayOfMonth(year, month);
  const actualDay = Math.min(day, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
}

function addMonths(year: number, month: number, shift: number): { year: number; month: number } {
  let m = month + shift;
  let y = year;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return { year: y, month: m };
}

export async function generateTaxPayments(
  params: GenerateParams,
  data: GenerateData,
): Promise<GenerateResult> {
  const { start_year, end_year, today, tax_payment_days, ip_fixed_contribution, credit_account_id } = params;
  const { transactions, accounts, companies, existing_taxes } = data;

  const to_create: TaxPaymentSpec[] = [];
  const to_skip: Array<{ reason: string; spec: Partial<TaxPaymentSpec> }> = [];
  const divergences: Array<{ message: string; company_id?: string }> = [];

  // Существующие import_hash — для дедупликации
  const existingHashes = new Set(
    existing_taxes.map((t: any) => String(t.import_hash || '')).filter(Boolean),
  );

  // ============================================
  // Обработка каждой компании
  // ============================================
  for (const company of companies) {
    const hasEmployees = Boolean(company.has_employees) || (company.monthly_payroll || 0) > 0;
    const isIndividual = Boolean(company.is_individual);
    const isOsno = company.tax_system === 'OSNO';
    const isUsn = company.tax_system === 'USN_6' || company.tax_system === 'USN_15';
    const vatIncluded = Boolean(company.vat_included);

    // ============================================
    // 1. ЕЖЕМЕСЯЧНЫЕ: страховые + НДФЛ
    // ============================================
    if (hasEmployees) {
      for (let year = start_year; year <= end_year; year++) {
        for (let month = 1; month <= 12; month++) {
          const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
          const lastDay = getLastDayOfMonth(year, month);
          const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

          // Считаем налоги за месяц
          let taxCalc: any;
          try {
            taxCalc = taxEngine.calculateTax(company, transactions, accounts, monthStart, monthEnd);
          } catch (e: any) {
            divergences.push({ message: `Ошибка расчёта налогов за ${monthStart}: ${e.message}`, company_id: company.id });
            continue;
          }

          // Страховые
          if (taxCalc.insurance_amount > 0.01) {
            const { year: py, month: pm } = addMonths(year, month, 1);
            const payDay = tax_payment_days.insurance || 28;
            const payDate = getPaymentDate(py, pm, payDay);
            const spec = makeSpec({
              company, taxType: 'insurance', amount: taxCalc.insurance_amount,
              date: payDate, today, credit_account_id,
              label: `Страховые взносы за ${MONTHS_RU[month - 1]} ${year}`,
            });

            if (existingHashes.has(spec.import_hash)) {
              to_skip.push({ reason: 'уже существует', spec });
            } else {
              to_create.push(spec);
            }
          }

          // НДФЛ
          if (taxCalc.ndfl_amount > 0.01) {
            const { year: py, month: pm } = addMonths(year, month, 1);
            const payDay = tax_payment_days.ndfl || 28;
            const payDate = getPaymentDate(py, pm, payDay);
            const spec = makeSpec({
              company, taxType: 'ndfl', amount: taxCalc.ndfl_amount,
              date: payDate, today, credit_account_id,
              label: `НДФЛ за ${MONTHS_RU[month - 1]} ${year}`,
            });

            if (existingHashes.has(spec.import_hash)) {
              to_skip.push({ reason: 'уже существует', spec });
            } else {
              to_create.push(spec);
            }
          }
        }
      }
    }

    // ============================================
    // 2. КВАРТАЛЬНЫЕ: УСН, НДС, прибыль (накопительно)
    // ============================================
    for (let year = start_year; year <= end_year; year++) {
      const yearStart = `${year}-01-01`;

      // Накопительные расчёты до конца каждого квартала
      const cum: any[] = [];
      for (const qEndMonth of [3, 6, 9, 12]) {
        const lastDay = getLastDayOfMonth(year, qEndMonth);
        const qEnd = `${year}-${String(qEndMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        try {
          cum.push(taxEngine.calculateTax(company, transactions, accounts, yearStart, qEnd));
        } catch (e: any) {
          divergences.push({ message: `Ошибка расчёта квартала Q${qEndMonth / 3} ${year}: ${e.message}`, company_id: company.id });
          cum.push(null);
        }
      }

      // Определяем налоги за каждый квартал
      const quarterTaxes: Array<{ quarter: number; usn?: number; vat?: number; profit?: number }> = [];
      for (let qi = 0; qi < 4; qi++) {
        const cur = cum[qi];
        const prev = qi > 0 ? cum[qi - 1] : null;
        if (!cur) {
          quarterTaxes.push({ quarter: qi + 1 });
          continue;
        }
        const prevUsn = prev?.income_tax_amount || 0;
        const prevVat = prev?.vat_to_pay || 0;
        const prevProfit = prev?.income_tax_amount || 0;

        const qUsn = Math.max(0, (cur.income_tax_amount || 0) - prevUsn);
        const qVat = Math.max(0, (cur.vat_to_pay || 0) - prevVat);
        const qProfit = Math.max(0, (cur.income_tax_amount || 0) - prevProfit);

        quarterTaxes.push({
          quarter: qi + 1,
          usn: isUsn ? qUsn : undefined,
          vat: vatIncluded ? qVat : undefined,
          profit: isOsno ? qProfit : undefined,
        });
      }

      // Создаём спеки
      for (const qt of quarterTaxes) {
        const qEndMonth = qt.quarter * 3;
        const { year: py, month: pm } = addMonths(year, qEndMonth, 1);

        // УСН
        if (qt.usn && qt.usn > 0.01) {
          const payDay = tax_payment_days.usn || 28;
          const payDate = getPaymentDate(py, pm, payDay);
          const spec = makeSpec({
            company, taxType: 'usn', amount: qt.usn,
            date: payDate, today, credit_account_id,
            label: `Налог УСН за Q${qt.quarter} ${year}`,
          });
          if (existingHashes.has(spec.import_hash)) {
            to_skip.push({ reason: 'уже существует', spec });
          } else {
            to_create.push(spec);
          }
        }

        // НДС
        if (qt.vat && qt.vat > 0.01) {
          const payDay = tax_payment_days.vat || 28;
          const payDate = getPaymentDate(py, pm, payDay);
          const spec = makeSpec({
            company, taxType: 'vat', amount: qt.vat,
            date: payDate, today, credit_account_id,
            label: `НДС за Q${qt.quarter} ${year}`,
          });
          if (existingHashes.has(spec.import_hash)) {
            to_skip.push({ reason: 'уже существует', spec });
          } else {
            to_create.push(spec);
          }
        }

        // Прибыль
        if (qt.profit && qt.profit > 0.01) {
          const payDay = tax_payment_days.profit || 28;
          const payDate = getPaymentDate(py, pm, payDay);
          const spec = makeSpec({
            company, taxType: 'profit', amount: qt.profit,
            date: payDate, today, credit_account_id,
            label: `Налог на прибыль за Q${qt.quarter} ${year}`,
          });
          if (existingHashes.has(spec.import_hash)) {
            to_skip.push({ reason: 'уже существует', spec });
          } else {
            to_create.push(spec);
          }
        }
      }
    }

    // ============================================
    // 3. ФИКС. ВЗНОСЫ ИП (раз в год — 28.12)
    // ============================================
    if (isIndividual) {
      for (let year = start_year; year <= end_year; year++) {
        const payDay = tax_payment_days.ip_fixed || 28;
        const payDate = getPaymentDate(year, 12, payDay);
        const spec = makeSpec({
          company, taxType: 'ip_fixed', amount: ip_fixed_contribution,
          date: payDate, today, credit_account_id,
          label: `Фикс. взносы ИП за ${year} год`,
        });
        if (existingHashes.has(spec.import_hash)) {
          to_skip.push({ reason: 'уже существует', spec });
        } else {
          to_create.push(spec);
        }
      }
    }
  }

  // ============================================
  // Сводка
  // ============================================
  const summary = {
    total: to_create.length,
    fact: to_create.filter(s => s.record_type === 'fact').length,
    plan: to_create.filter(s => s.record_type === 'plan').length,
    by_company: {} as Record<string, { count: number; amount: number }>,
    by_tax: {} as Record<string, { count: number; amount: number }>,
  };

  for (const spec of to_create) {
    // by company
    if (!summary.by_company[spec.company_id]) {
      summary.by_company[spec.company_id] = { count: 0, amount: 0 };
    }
    summary.by_company[spec.company_id].count += 1;
    summary.by_company[spec.company_id].amount += spec.amount_rub;

    // by tax
    if (!summary.by_tax[spec.tax_type]) {
      summary.by_tax[spec.tax_type] = { count: 0, amount: 0 };
    }
    summary.by_tax[spec.tax_type].count += 1;
    summary.by_tax[spec.tax_type].amount += spec.amount_rub;
  }

  return { to_create, to_skip, summary, divergences };
}

// ============================================
// Вспомогательные
// ============================================

function makeSpec(args: {
  company: any;
  taxType: 'usn' | 'vat' | 'profit' | 'insurance' | 'ndfl' | 'ip_fixed';
  amount: number;
  date: string;
  today: string;
  credit_account_id: string;
  label: string;
}): TaxPaymentSpec {
  const { company, taxType, amount, date, today, credit_account_id, label } = args;
  const debitAccount = TAX_ACCOUNTS[taxType];
  const importHash = `tax-${company.id}-${date}-${debitAccount}`;
  const recordType: 'fact' | 'plan' = date <= today ? 'fact' : 'plan';

  return {
    id: '',
    date,
    description: `${label} [${company.name}]`,
    amount: Math.round(amount * 100) / 100,
    amount_rub: Math.round(amount * 100) / 100,
    currency: 'RUB',
    type: 'expense',
    company_id: company.id,
    debit_account_id: debitAccount,
    credit_account_id: credit_account_id,
    record_type: recordType,
    source: 'calculated',
    import_hash: importHash,
    tax_type: taxType,
  };
}
