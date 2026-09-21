import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth-server';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }
    if (!['owner', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Нет прав' }, { status: 403 });
    }

    const body = await request.json();
    const { batch_id } = body;

    if (!batch_id) {
      return NextResponse.json({ error: 'Не указан batch_id' }, { status: 400 });
    }

    const deleted = await prisma.transaction.deleteMany({
      where: { import_batch_id: batch_id },
    });

    await prisma.importLog.updateMany({
      where: { batch_id },
      data: { status: 'rolled_back' },
    });

    return NextResponse.json({ success: true, deleted: deleted.count });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
