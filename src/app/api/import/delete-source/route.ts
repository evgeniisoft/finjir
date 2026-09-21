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
    const {
      source_id,
      delete_mappings = true,
      delete_transactions = false,
      delete_logs = false,
    } = body;

    if (!source_id) {
      return NextResponse.json({ error: 'Не указан source_id' }, { status: 400 });
    }

    const result: any = {
      success: true,
      deleted: {
        source: 0,
        mappings: 0,
        transactions: 0,
        logs: 0,
      },
    };

    // 1. Удалить транзакции (если выбрано)
    if (delete_transactions) {
      const logs = await prisma.importLog.findMany({
        where: { source_id },
        select: { batch_id: true },
      });

      if (logs.length > 0) {
        const batchIds = logs.map((l) => l.batch_id);
        const delTx = await prisma.transaction.deleteMany({
          where: { import_batch_id: { in: batchIds } },
        });
        result.deleted.transactions = delTx.count;
      }
    }

    // 2. Удалить маппинги (если выбрано)
    if (delete_mappings) {
      const delMappings = await prisma.dataMapping.deleteMany({
        where: { source_id },
      });
      result.deleted.mappings = delMappings.count;
    }

    // 3. Удалить логи (если выбрано)
    if (delete_logs) {
      const delLogs = await prisma.importLog.deleteMany({
        where: { source_id },
      });
      result.deleted.logs = delLogs.count;
    }

    // 4. Удалить источник
    await prisma.dataSource.delete({
      where: { id: source_id },
    });
    result.deleted.source = 1;

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('Ошибка delete-source:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
