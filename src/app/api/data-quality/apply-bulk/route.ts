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
    const { entity_ids, action, user_input, rule_id } = body;

    if (!Array.isArray(entity_ids) || entity_ids.length === 0) {
      return NextResponse.json({ error: 'Не указан список entity_ids' }, { status: 400 });
    }

    const repo = getRepository();
    const transactions = await repo.getAll('Transactions');

    const results: any[] = [];
    const errors: any[] = [];

    for (const id of entity_ids) {
      const entity = transactions.find((t: any) => t.id === id);
      if (!entity) {
        errors.push({ id, error: 'Транзакция не найдена' });
        continue;
      }

      const r = await applyAction({
        entity,
        action,
        userInput: user_input,
        ruleId: rule_id,
        userId: user.id,
      });

      if (r.success) results.push(id);
      else errors.push({ id, error: r.error });
    }

    return NextResponse.json({
      success: errors.length === 0,
      applied: results.length,
      failed: errors.length,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
