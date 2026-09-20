/**
 * Форматирование дат для отчётов
 */

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/**
 * Форматирование месяца: "2026-01" → "янв 26"
 */
export function formatMonth(monthStr: string): string {
  try {
    const [year, month] = monthStr.split('-');
    const monthIndex = parseInt(month) - 1;
    const shortYear = year.substring(2);
    return `${MONTHS_RU[monthIndex]} ${shortYear}`;
  } catch {
    return monthStr;
  }
}

/**
 * Форматирование недели: "2026-W02" → "2 нед 26"
 */
export function formatWeek(weekStr: string): string {
  try {
    const [year, week] = weekStr.split('-W');
    const shortYear = year.substring(2);
    return `${parseInt(week)} нед ${shortYear}`;
  } catch {
    return weekStr;
  }
}
/**
 * Форматирование кварталов: "2026-Q1" → "1 кв. 26"
 */
export function formatQuarter(period: string): string {
  // period = "2026-Q1" → "1 кв. 26"
  const match = period.match(/^(\d{4})-Q(\d)$/);
  if (!match) return period;
  const [, year, q] = match;
  return `${q} кв. ${year.substring(2)}`;
}
/**
 * Форматирование дня: "2026-01-09T21:00:00.000Z" → "09 янв 26"
 */
export function formatDay(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const monthIndex = date.getMonth();
    const year = String(date.getFullYear()).substring(2);
    return `${day} ${MONTHS_RU[monthIndex]} ${year}`;
  } catch {
    return dateStr;
  }
}
