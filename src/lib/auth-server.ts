/**
 * ============================================
 * FinEngine 2026 - Серверная аутентификация
 * ============================================
 * Работает с HttpOnly cookie 'session_token'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const SESSION_COOKIE = 'session_token';
export const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  company_id: string;
  tenant_id: string;
}

// ============================================
// Создание сессии
// ============================================
export async function createSession(
  userId: string,
  request?: NextRequest
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      token,
      user_id: userId,
      expires_at: expiresAt,
      ip_address: request?.headers.get('x-forwarded-for') || null,
      user_agent: request?.headers.get('user-agent') || null,
    },
  });

  return { token, expiresAt };
}

// ============================================
// Получение пользователя из cookie
// ============================================
export async function getSessionUser(
  request?: NextRequest
): Promise<SessionUser | null> {
  let token: string | undefined;

  // 1. Из NextRequest (API routes)
  if (request) {
    token = request.cookies.get(SESSION_COOKIE)?.value;
  }

  // 2. Из next/headers (Server Components)
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE)?.value;
    } catch {
      // ignore
    }
  }

  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
  });

  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    // Истекла — удаляем
    await prisma.session.delete({ where: { token } });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user_id },
  });

  if (!user || user.is_active === false) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name || user.email,
    role: user.role || 'viewer',
    company_id: user.company_id || '',
    tenant_id: session.tenant_id || 'tenant-1',
  };
}

// ============================================
// Требование авторизации — возвращает user или Response 401
// ============================================
export async function requireAuth(
  request: NextRequest
): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }
  return user;
}

// ============================================
// Требование роли
// ============================================
export function requireRole(
  user: SessionUser,
  allowedRoles: string[]
): NextResponse | null {
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: 'Нет прав для этого действия' },
      { status: 403 }
    );
  }
  return null;
}

// ============================================
// Удаление сессии
// ============================================
export async function destroySession(token: string): Promise<void> {
  try {
    await prisma.session.delete({ where: { token } });
  } catch {
    // ignore
  }
}

// ============================================
// Утилита: установка cookie в ответе
// ============================================
export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
