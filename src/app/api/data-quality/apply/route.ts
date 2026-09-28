import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';
import { applyAction } from '@/lib/data-quality/actions';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const body = await request.json();
    const { entity_id, action, user_input, rule_id } = body;

    if (!entity_id || !action) {
      return NextResponse.json({ error: 'Не указан entity_id или action' }, { status: 400 });
    }

    const repo = getRepository();
    const transactions = await repo.getAll('Transactions');
    const entity = transactions.find((t: any) => t.id === entity_id);
    if (!entity) return NextResponse.json({ error: 'Транзакция не найдена' }, { status: 404 });

    const result = await applyAction({
      entity,
      action,
      userInput: user_input,
      ruleId: rule_id,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
