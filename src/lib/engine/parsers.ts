/**
 * Парсеры CSV / TSV / Excel (CSV с разными разделителями)
 */

export interface ParseOptions {
  delimiter?: string;
  encoding?: string;
  hasHeader?: boolean;
}

export function parseCSV(content: string, options: ParseOptions = {}): {
  headers: string[];
  rows: string[][];
} {
  const delimiter = options.delimiter || detectDelimiter(content);
  const lines = splitLines(content);
  if (lines.length === 0) return { headers: [], rows: [] };

  const allRows = lines.map((line) => parseCSVLine(line, delimiter));
  const hasHeader = options.hasHeader !== false;

  if (hasHeader) {
    return {
      headers: allRows[0].map((h) => h.trim()),
      rows: allRows.slice(1),
    };
  }

  return {
    headers: allRows[0].map((_, i) => `col_${i}`),
    rows: allRows,
  };
}

function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/)[0] || '';
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  };
  if (counts[';'] > counts[','] && counts[';'] > counts['\t']) return ';';
  if (counts['\t'] > counts[',']) return '\t';
  return ',';
}

function splitLines(content: string): string[] {
  return content.split(/\r?\n/).filter((l) => l.trim() !== '');
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
