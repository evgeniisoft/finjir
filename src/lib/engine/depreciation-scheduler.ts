/**
 * ============================================
 * FinEngine 2026 - Depreciation Scheduler
 * ============================================
 * Генерирует транзакции амортизации ОС (план).
 *
 * Логика:
 *  - Для каждого активного ОС, для каждого месяца
 *    начиная со следующего после даты ввода в эксплуатацию.
 *  - Ежемесячная сумма = (initial_cost − salvage_value) / useful_life_months.
 *  - Дата = последний день месяца.
 *  - record_type = 'fact', если дата ≤ today, иначе 'plan'.
 *  - import_hash = depreciation-<asset_id>-<YYYY-MM>.
 *  - Прекращение: если status='disposed' и disposal_date < конец месяца.
 *
 * Дедупликация по import_hash.
 */

export interface DepreciationSpec {
  id: string;
  date: string;
  description: string;
  amount: number;
  amount_rub: number;
  currency: 'RUB';
  type: 'expense';
  company_id: string;
  debit_account_id: string;    // acc-depreciation-os
  credit_account_id: string;   // acc-fa-001
  record_type: 'fact' | 'plan';
  source: 'calculated';
  import_hash: string;
  asset_id: string;
}

export interface GenerateParams {
  start_year: number;
  end_year: number;
  today: string;                       // "2026-10-01"
}

export interface GenerateData {
  assets: any[];                       // FixedAsset[]
  existing_hashes: string[];           // import_hash из существующих транзакций
}

export interface GenerateResult {
  to_create: DepreciationSpec[];
  to_skip: Array<{ reason: string; spec: Partial<DepreciationSpec> }>;
  summary: {
    total: number;
    fact: number;
    plan: number;
    by_company: Record<string, { count: number; amount: number }>;
    by_asset: Record<string, { count: number; amount: number }>;
  };
  divergences: Array<{ message: string; asset_id?: string }>;
}

const MONTHS_RU = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getMonthEnd(year: number, month: number): string {
  const lastDay = getLastDayOfMonth(year, month);
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function addMonths(year: number, month: number, shift: number): { year: number; month: number } {
  let m = month + shift;
  let y = year;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return { year: y, month: m };
}

export function generateDepreciationPayments(
  params: GenerateParams,
  data: GenerateData,
): GenerateResult {
  const { start_year, end_year, today } = params;
  const { assets, existing_hashes } = data;

  const to_create: DepreciationSpec[] = [];
  const to_skip: Array<{ reason: string; spec: Partial<DepreciationSpec> }> = [];
  const divergences: Array<{ message: string; asset_id?: string }> = [];

  const existingHashes = new Set(existing_hashes);

  // ============================================
  // Обработка каждого ОС
  // ============================================
  for (const asset of assets) {
    if (!asset || asset.status === 'disposed' && !asset.disposal_date) {
      // Если выбыло и нет даты выбытия — пропускаем
      continue;
    }

    const initialCost = Number(asset.initial_cost || 0);
    const salvageValue = Number(asset.salvage_value || 0);
    const usefulLife = Number(asset.useful_life_months || 0);

    if (initialCost <= 0 || usefulLife <= 0) {
      divergences.push({
        message: `ОС "${asset.name}": некорректная стоимость или срок`,
        asset_id: asset.id,
      });
      continue;
    }

    const monthlyAmount = (initialCost - salvageValue) / usefulLife;
    if (monthlyAmount <= 0) continue;

    // Дата начала: месяц, следующий за датой ввода
    const commissioningDate = new Date(asset.commissioning_date);
    const startYM = addMonths(
      commissioningDate.getUTCFullYear(),
      commissioningDate.getUTCMonth() + 1,
      1,
    );

    // Дата выбытия (если есть)
    const disposalDate = asset.disposal_date ? new Date(asset.disposal_date) : null;

    // Пробегаем по всем месяцам в диапазоне [start_year..end_year]
    for (let year = start_year; year <= end_year; year++) {
      for (let month = 1; month <= 12; month++) {
        // Пропускаем месяцы до начала
        if (year < startYM.year || (year === startYM.year && month < startYM.month)) {
          continue;
        }

        // Дата конца месяца
        const dateStr = getMonthEnd(year, month);

        // Прекращение по выбытию: не включая месяц выбытия
        if (disposalDate) {
          const disposalYM = `${disposalDate.getUTCFullYear()}-${String(disposalDate.getUTCMonth() + 1).padStart(2, '0')}`;
          const currentYM = `${year}-${String(month).padStart(2, '0')}`;
          if (currentYM >= disposalYM) continue;
        }

        const importHash = `depreciation-${asset.id}-${year}-${String(month).padStart(2, '0')}`;
        const recordType: 'fact' | 'plan' = dateStr <= today ? 'fact' : 'plan';

        const spec: DepreciationSpec = {
          id: '',
          date: dateStr,
          description: `Амортизация ОС: ${asset.name} за ${MONTHS_RU[month - 1]} ${year}`,
          amount: Math.round(monthlyAmount * 100) / 100,
          amount_rub: Math.round(monthlyAmount * 100) / 100,
          currency: 'RUB',
          type: 'expense',
          company_id: asset.company_id,
          debit_account_id: asset.depreciation_account_id || 'acc-depreciation-os',
          credit_account_id: asset.account_id || 'acc-fa-001',
          record_type: recordType,
          source: 'calculated',
          import_hash: importHash,
          asset_id: asset.id,
        };

        if (existingHashes.has(importHash)) {
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
    fact: to_create.filter((s) => s.record_type === 'fact').length,
    plan: to_create.filter((s) => s.record_type === 'plan').length,
    by_company: {} as Record<string, { count: number; amount: number }>,
    by_asset: {} as Record<string, { count: number; amount: number }>,
  };

  for (const spec of to_create) {
    if (!summary.by_company[spec.company_id]) {
      summary.by_company[spec.company_id] = { count: 0, amount: 0 };
    }
    summary.by_company[spec.company_id].count += 1;
    summary.by_company[spec.company_id].amount += spec.amount_rub;

    if (!summary.by_asset[spec.asset_id]) {
      summary.by_asset[spec.asset_id] = { count: 0, amount: 0 };
    }
    summary.by_asset[spec.asset_id].count += 1;
    summary.by_asset[spec.asset_id].amount += spec.amount_rub;
  }

  return { to_create, to_skip, summary, divergences };
}
