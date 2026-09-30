/**
 * ============================================
 * FinEngine 2026 - Дни уплаты налогов
 * ============================================
 * Хранит дни уплаты в Settings.
 * Ключ: tax_payment_day_${taxType}
 * Значение: число 1..31
 * Категория: tax_payment_day
 *
 * Все ставки — федеральные, одинаковые для всех компаний.
 * Дефолт: 28 (единый налоговый платёж в РФ).
 */

export type TaxType =
  | 'vat'
  | 'usn'
  | 'profit'
  | 'insurance'
  | 'ndfl'
  | 'ip_fixed';

export const TAX_TYPES: { key: TaxType; label: string; description: string }[] = [
  { key: 'vat', label: 'НДС', description: 'Квартальный. Уплата до 28-го числа месяца, следующего за кварталом.' },
  { key: 'usn', label: 'Налог УСН', description: 'Квартальный аванс. Уплата до 28-го числа месяца, следующего за кварталом.' },
  { key: 'profit', label: 'Налог на прибыль', description: 'Квартальный. Уплата до 28-го числа месяца, следующего за кварталом.' },
  { key: 'insurance', label: 'Страховые взносы', description: 'Ежемесячно. Уплата до 28-го числа месяца, следующего за расчётным.' },
  { key: 'ndfl', label: 'НДФЛ', description: 'Ежемесячно. Уплата до 28-го числа месяца, следующего за расчётным.' },
  { key: 'ip_fixed', label: 'Фикс. взносы ИП', description: 'Годовой. Уплата до 28 декабря текущего года.' },
];

export const DEFAULT_PAYMENT_DAY = 28;

/**
 * Ключ для хранения в Settings.
 */
export function taxPaymentDayKey(taxType: TaxType): string {
  return `tax_payment_day_${taxType}`;
}

/**
 * Прочитать день уплаты из массива Settings.
 * Если настройки нет — вернуть дефолт.
 */
export function getTaxPaymentDay(settings: any[], taxType: TaxType): number {
  const key = taxPaymentDayKey(taxType);
  const setting = settings.find((s) => s.key === key);
  if (!setting) return DEFAULT_PAYMENT_DAY;
  const val = parseInt(String(setting.value || ''), 10);
  if (isNaN(val) || val < 1 || val > 31) return DEFAULT_PAYMENT_DAY;
  return val;
}

/**
 * Прочитать все дни уплаты.
 */
export function getAllTaxPaymentDays(settings: any[]): Record<TaxType, number> {
  const result: Record<TaxType, number> = {
    vat: DEFAULT_PAYMENT_DAY,
    usn: DEFAULT_PAYMENT_DAY,
    profit: DEFAULT_PAYMENT_DAY,
    insurance: DEFAULT_PAYMENT_DAY,
    ndfl: DEFAULT_PAYMENT_DAY,
    ip_fixed: DEFAULT_PAYMENT_DAY,
  };
  for (const t of TAX_TYPES) {
    result[t.key] = getTaxPaymentDay(settings, t.key);
  }
  return result;
}

/**
 * Валидация значения дня.
 */
export function validatePaymentDay(value: any): { valid: boolean; value: number; error?: string } {
  const num = parseInt(String(value), 10);
  if (isNaN(num)) return { valid: false, value: DEFAULT_PAYMENT_DAY, error: 'Не число' };
  if (num < 1 || num > 31) return { valid: false, value: DEFAULT_PAYMENT_DAY, error: 'День должен быть от 1 до 31' };
  return { valid: true, value: num };
}
