import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source_id } = body;

    if (!source_id) {
      return NextResponse.json({ error: 'Не указан source_id' }, { status: 400 });
    }

    // Найти все batch_id для этого источника
    const logs = await prisma.importLog.findMany({
      where: { source_id },
      select: { batch_id: true },
    });

    if (logs.length === 0) {
      return NextResponse.json({ success: true, deleted: 0, batches: 0 });
    }

    const batchIds = logs.map((l) => l.batch_id);

    // Удалить все транзакции с этими batch_id
    const deleted = await prisma.transaction.deleteMany({
      where: { import_batch_id: { in: batchIds } },
    });

    // Обновить статус в ImportLog
    await prisma.importLog.updateMany({
      where: { source_id },
      data: { status: 'rolled_back' },
    });

    return NextResponse.json({
      success: true,
      deleted: deleted.count,
      batches: batchIds.length,
    });
  } catch (e: any) {
    console.error('Ошибка rollback-source:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
