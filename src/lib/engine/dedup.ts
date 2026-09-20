/**
 * Дедупликация импорта
 */

import { createHash } from 'crypto';

export function makeImportHash(
  data: any,
  dedupKey: string[]
): string {
  const parts = dedupKey.map((k) => String(data[k] ?? ''));
  const raw = parts.join('|');
  return createHash('sha256').update(raw).digest('hex');
}

export function makeFileHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
