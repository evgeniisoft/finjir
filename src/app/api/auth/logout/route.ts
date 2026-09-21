import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  destroySession,
  clearSessionCookie,
} from '@/lib/auth-server';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    await destroySession(token);
  }

  const response = NextResponse.json({ success: true });
  return clearSessionCookie(response);
}
