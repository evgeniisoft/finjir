import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';
import { defaultProblemTemplate, defaultExplanationTemplate, defaultActionsForRule } from '@/lib/data-quality/templates';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const repo = getRepository();
    const [rules, accounts] = await Promise.all([
      repo.getAll('DataQualityRules'),
      repo.getAll('Accounts'),
    ]);

    // Разворачиваем JSON-поля
    const result = rules
      .filter((r: any) => !r.is_deleted)
      .map((r: any) => ({
        ...r,
        condition: parseJson(r.condition),
        params: parseJson(r.params),
        suggested_actions: parseJson(r.suggested_actions),
      }));

    return NextResponse.json({ rules: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const body = await request.json();
    const repo = getRepository();
    const accounts = await repo.getAll('Accounts');

    // Авто-подстановка шаблонов и действий, если не заданы
    const ruleType = body.rule_type;
    const prepared: any = {
      tenant_id: 'tenant-1',
      name: body.name,
      description: body.description || null,
      category: body.category || 'general',
      rule_type: ruleType,
      entity_type: body.entity_type,
      target_field: body.target_field,
      condition: JSON.stringify(body.condition || {}),
      params: JSON.stringify(body.params || {}),
      problem_template: body.problem_template || defaultProblemTemplate(body),
      explanation_template: body.explanation_template || defaultExplanationTemplate(body),
      suggested_actions: JSON.stringify(
        body.suggested_actions || defaultActionsForRule(body, { accounts, companies: [] })
      ),
      severity: body.severity || 'warning',
      is_active: body.is_active !== false,
      auto_apply: Boolean(body.auto_apply),
      is_deleted: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await repo.create('DataQualityRules', prepared);
    return NextResponse.json({ rule: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function parseJson(s: any): any {
  if (!s) return null;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return null; }
}
