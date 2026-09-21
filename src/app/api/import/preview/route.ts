import { NextRequest, NextResponse } from 'next/server';
import { parseCSV } from '@/lib/engine/parsers';
import { suggestTargetField } from '@/lib/engine/autoMapper';
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
    const { file_content, target_type } = body;

    if (!file_content) {
      return NextResponse.json({ error: 'Нет содержимого файла' }, { status: 400 });
    }

    const { headers, rows } = parseCSV(file_content);

    // Уникальные значения по каждой колонке (для маппинга значений)
    const uniqueValues: { [col: string]: string[] } = {};
    for (let c = 0; c < headers.length; c++) {
      const set = new Set<string>();
      for (const row of rows) {
        const v = String(row[c] || '').trim();
        if (v) set.add(v);
      }
      uniqueValues[headers[c]] = Array.from(set).slice(0, 100); // макс 100
    }

    // Авто-сопоставление колонок
    const availableFields = getAvailableFields(target_type);
    const autoMapping: { [header: string]: string } = {};
    for (const h of headers) {
      const suggested = suggestTargetField(h, availableFields);
      if (suggested) autoMapping[h] = suggested;
    }

    return NextResponse.json({
      headers,
      preview: rows.slice(0, 5),
      total_rows: rows.length,
      unique_values: uniqueValues,
      auto_mapping: autoMapping,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function getAvailableFields(targetType: string): string[] {
  switch (targetType) {
    case 'transactions':
      return ['date', 'amount', 'description', 'currency', 'counterparty', 'debit_account', 'credit_account', 'type', 'external_id', 'vat_rate', 'vat_amount', 'accrual_date'];
    case 'companies':
      return ['name', 'inn', 'kpp', 'tax_system'];
    case 'counterparties':
      return ['name', 'inn', 'type'];
    case 'accounts':
      return ['code', 'name', 'type', 'is_cash_flow'];
    default:
      return [];
  }
}
