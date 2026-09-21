import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseCSV } from '@/lib/engine/parsers';
import { runImport } from '@/lib/engine/importRunner';
import { getSessionUser } from '@/lib/auth-server';


export const maxDuration = 60;

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
    const { source_id, mapping_id, file_content, file_name, company_id } = body;
    const user_id = user.id;

    if (!source_id || !mapping_id || !file_content) {
      return NextResponse.json({ error: 'Не хватает параметров' }, { status: 400 });
    }

    const source = await prisma.dataSource.findUnique({ where: { id: source_id } });
    const mapping = await prisma.dataMapping.findUnique({ where: { id: mapping_id } });

    if (!source || !mapping) {
      return NextResponse.json({ error: 'Источник или маппинг не найден' }, { status: 404 });
    }

    const { headers, rows } = parseCSV(file_content);

    const result = await runImport({
      source,
      mapping,
      rows,
      headers,
      company_id,
      user_id,
      file_name,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error('Ошибка импорта:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
