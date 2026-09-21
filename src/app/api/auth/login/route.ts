import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession, setSessionCookie } from '@/lib/auth-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Введите email и пароль' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        email: String(email).toLowerCase(),
        is_active: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Пользователь не найден или неактивен' },
        { status: 401 }
      );
    }

    if (String(user.password) !== String(password)) {
      return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });
    }

    // Создаём сессию
    const { token, expiresAt } = await createSession(user.id, request);

    // AuditLog
    try {
      await prisma.auditLogEntry.create({
        data: {
          user_id: user.id,
          action: 'login',
          entity: '',
          entity_id: '',
          changes: '',
          timestamp: new Date(),
        },
      });
    } catch (e) {
      console.error('AuditLog error:', e);
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || user.email,
        role: user.role || 'viewer',
        company_id: user.company_id || '',
      },
    });

    return setSessionCookie(response, token, expiresAt);
  } catch (e: any) {
    console.error('Login error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
