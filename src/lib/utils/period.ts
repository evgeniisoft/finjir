/**
 * Утилиты для работы с периодами
 */

export type PeriodType = 'today' | 'month' | 'quarter' | 'year';

export interface PeriodRange {
  start: string;   // "2026-09-01"
  end: string;     // "2026-09-30"
  label: string;   // "сентябрь 2026"
}

const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
];

/**
 * Возвращает диапазон дат для указанного типа периода.
 * @param type — 'today' | 'month' | 'quarter' | 'year'
 * @param baseDate — дата отсчёта (по умолчанию — сегодня)
 */
export function getPeriodRange(
  type: PeriodType,
  baseDate: Date = new Date()
): PeriodRange {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); // 0-11

  switch (type) {
    case 'today': {
      const todayStr = formatDate(baseDate);
      return {
        start: todayStr,
        end: todayStr,
        label: `сегодня, ${todayStr}`,
      };
    }

    case 'month': {
      const m = month + 1;
      const lastDay = new Date(year, m, 0).getDate();
      const start = `${year}-${pad(m)}-01`;
      const end = `${year}-${pad(m)}-${pad(lastDay)}`;
      return {
        start,
        end,
        label: `${MONTH_NAMES[month]} ${year}`,
      };
    }

    case 'quarter': {
      const q = Math.floor(month / 3); // 0-3
      const startMonth = q * 3 + 1;
      const endMonth = q * 3 + 3;
      const lastDay = new Date(year, endMonth, 0).getDate();
      const start = `${year}-${pad(startMonth)}-01`;
      const end = `${year}-${pad(endMonth)}-${pad(lastDay)}`;
      return {
        start,
        end,
        label: `${q + 1} квартал ${year}`,
      };
    }

    case 'year': {
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
        label: `${year} год`,
      };
    }
  }
}

/**
 * Диапазон за прошлый месяц.
 */
export function getLastMonthRange(baseDate: Date = new Date()): PeriodRange {
  const prev = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
  return getPeriodRange('month', prev);
}

/**
 * Диапазон за прошлый год.
 */
export function getLastYearRange(baseDate: Date = new Date()): PeriodRange {
  const prev = new Date(baseDate.getFullYear() - 1, 0, 1);
  return getPeriodRange('year', prev);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
