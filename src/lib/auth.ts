/**
 * ============================================
 * FinEngine 2026 - Аутентификация
 * ============================================
 */

export interface Session {
  userEmail: string;
  userName: string;
  userRole: string;
  userId: string;
  companyId: string;
}

const SESSION_KEY = 'finengine_session';

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(SESSION_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}


export function isAuthenticated(): boolean {
  return getSession() !== null;
}
