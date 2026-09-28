/**
 * ============================================
 * FinEngine 2026 - Data Quality
 * Клиентские хелперы для UI
 * ============================================
 */

export async function fetchRules(): Promise<any[]> {
  const r = await fetch('/api/data-quality/rules');
  const d = await r.json();
  return d.rules || [];
}

export async function fetchExceptions(): Promise<any[]> {
  const r = await fetch('/api/data-quality/exceptions');
  const d = await r.json();
  return d.exceptions || [];
}

export async function runChecks(): Promise<any> {
  const r = await fetch('/api/data-quality/run', { method: 'POST' });
  return r.json();
}

export async function previewAction(payload: {
  entity_id: string;
  action: any;
  user_input?: any;
  period_start?: string;
  period_end?: string;
}): Promise<any> {
  const r = await fetch('/api/data-quality/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function applyAction(payload: {
  entity_id: string;
  action: any;
  user_input?: any;
  rule_id?: string;
}): Promise<any> {
  const r = await fetch('/api/data-quality/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function applyBulk(payload: {
  entity_ids: string[];
  action: any;
  user_input?: any;
  rule_id?: string;
}): Promise<any> {
  const r = await fetch('/api/data-quality/apply-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function seedRules(): Promise<any> {
  const r = await fetch('/api/data-quality/seed', { method: 'POST' });
  return r.json();
}

export async function createRule(data: any): Promise<any> {
  const r = await fetch('/api/data-quality/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function updateRule(id: string, data: any): Promise<any> {
  const r = await fetch(`/api/data-quality/rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function deleteRule(id: string): Promise<any> {
  const r = await fetch(`/api/data-quality/rules/${id}`, { method: 'DELETE' });
  return r.json();
}

export async function createException(data: any): Promise<any> {
  const r = await fetch('/api/data-quality/exceptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function deleteException(id: string): Promise<any> {
  const r = await fetch(`/api/data-quality/exceptions/${id}`, { method: 'DELETE' });
  return r.json();
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('ru-RU') + ' ₽';
}

export function fmtDiff(v: number | null | undefined): string {
  if (v == null || v === 0) return '0 ₽';
  const sign = v > 0 ? '+' : '';
  return sign + Math.round(v).toLocaleString('ru-RU') + ' ₽';
}

export function severityLabel(s: string): string {
  switch (s) {
    case 'critical': return 'Критично';
    case 'warning': return 'Предупреждение';
    case 'info': return 'Инфо';
    default: return s;
  }
}

export function severityColor(s: string): string {
  switch (s) {
    case 'critical': return 'text-red-600 bg-red-50 border-red-200';
    case 'warning': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    case 'info': return 'text-blue-600 bg-blue-50 border-blue-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}
