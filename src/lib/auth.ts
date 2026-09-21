/**
 * ============================================
 * FinEngine 2026 - Клиентская аутентификация
 * ============================================
 * Сессия хранится в HttpOnly cookie — JS её не видит.
 * Здесь только вспомогательные функции.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  company_id: string;
}

export async function fetchCurrentUser(): Promise<SessionUser | null> {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  } catch (e) {
    console.error('Logout error:', e);
    window.location.href = '/login';
  }
}
