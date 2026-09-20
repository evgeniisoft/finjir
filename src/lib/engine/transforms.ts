/**
 * Трансформации значений при импорте
 */

export function applyTransform(
  value: any,
  transform: string | undefined
): any {
  if (value === null || value === undefined) return value;
  if (!transform || transform === 'none') return value;

  switch (transform) {
    case 'parse_date':
      return parseDate(value);
    case 'parse_float':
      return parseFloat(value);
    case 'parse_int':
      return parseInt(value);
    case 'uppercase':
      return String(value).toUpperCase();
    case 'lowercase':
      return String(value).toLowerCase();
    case 'trim':
      return String(value).trim();
    default:
      return value;
  }
}

export function parseDate(value: any): string | null {
  if (!value) return null;
  const s = String(value).trim();

  // Уже ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

  // DD.MM.YYYY
  const dots = s.split('.');
  if (dots.length === 3) {
    const [d, m, y] = dots;
    if (y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY
  const slashes = s.split('/');
  if (slashes.length === 3) {
    const [d, m, y] = slashes;
    if (y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Пробуем Date
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

export function parseFloat(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  const s = String(value)
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export function parseInt(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  const s = String(value).replace(/\s/g, '').replace(/[^\d-]/g, '');
  const n = Number(s);
  return isNaN(n) ? 0 : Math.trunc(n);
}
