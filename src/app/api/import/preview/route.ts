import { NextRequest, NextResponse } from 'next/server';
import { parseCSV } from '@/lib/engine/parsers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { file_content } = body;

    if (!file_content) {
      return NextResponse.json({ error: 'Нет содержимого файла' }, { status: 400 });
    }

    const { headers, rows } = parseCSV(file_content);
    return NextResponse.json({
      headers,
      preview: rows.slice(0, 5),
      total_rows: rows.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
