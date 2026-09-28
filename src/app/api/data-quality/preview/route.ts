import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';
import { previewAction } from '@/lib/data-quality/preview';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const body = await request.json();
    const { entity_id, action, user_input, period_start, period_end } = body;

    if (!entity_id || !action) {
      return NextResponse.json({ error: 'Не указан entity_id или action' }, { status: 400 });
    }

    const repo = getRepository();
    const [transactions, accounts, companies, budgets] = await Promise.all([
      repo.getAll('Transactions'),
      repo.getAll('Accounts'),
      repo.getAll('Companies'),
      repo.getAll('Budgets'),
    ]);

    const entity = transactions.find((t: any) => t.id === entity_id);
    if (!entity) return NextResponse.json({ error: 'Транзакция не найдена' }, { status: 404 });

    const periodStart = period_start || `${new Date().getFullYear()}-01-01`;
    const periodEnd = period_end || `${new Date().getFullYear()}-12-31`;

    const result = await previewAction({
      entity,
      action,
      userInput: user_input,
      allData: { transactions, accounts, companies, budgets },
      periodStart,
      periodEnd,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
