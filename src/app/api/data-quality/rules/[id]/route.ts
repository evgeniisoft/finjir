import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const body = await request.json();
    const repo = getRepository();

    const update: any = { updated_at: new Date().toISOString() };
    for (const key of [
      'name', 'description', 'category', 'rule_type', 'entity_type', 'target_field',
      'problem_template', 'explanation_template', 'severity',
    ]) {
      if (body[key] !== undefined) update[key] = body[key];
    }
    for (const key of ['condition', 'params', 'suggested_actions']) {
      if (body[key] !== undefined) update[key] = JSON.stringify(body[key]);
    }
    if (body.is_active !== undefined) update.is_active = Boolean(body.is_active);
    if (body.auto_apply !== undefined) update.auto_apply = Boolean(body.auto_apply);

    const result = await repo.update('DataQualityRules', params.id, update);
    return NextResponse.json({ rule: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const repo = getRepository();
    // Soft delete
    await repo.update('DataQualityRules', params.id, {
      is_deleted: 'true',
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
