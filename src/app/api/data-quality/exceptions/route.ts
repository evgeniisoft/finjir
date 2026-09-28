import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const repo = getRepository();
    const exceptions = await repo.getAll('DataQualityExceptions');
    return NextResponse.json({ exceptions });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const body = await request.json();
    const repo = getRepository();

    const created = await repo.create('DataQualityExceptions', {
      tenant_id: 'tenant-1',
      rule_id: body.rule_id,
      entity_type: body.entity_type || 'Transactions',
      entity_id: body.entity_id,
      reason: body.reason || null,
      created_by: user.id,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ exception: created });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
