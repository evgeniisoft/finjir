import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';
import { SEED_RULES } from '@/lib/data-quality/seed';
import { defaultProblemTemplate, defaultExplanationTemplate, defaultActionsForRule } from '@/lib/data-quality/templates';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const repo = getRepository();
    const [existing, accounts] = await Promise.all([
      repo.getAll('DataQualityRules'),
      repo.getAll('Accounts'),
    ]);
    const existingNames = new Set(existing.map((r: any) => r.name));

    const toCreate = SEED_RULES
      .filter(r => !existingNames.has(r.name!))
      .map(r => ({
        tenant_id: 'tenant-1',
        name: r.name!,
        description: r.description || null,
        category: r.category || 'general',
        rule_type: r.rule_type!,
        entity_type: r.entity_type!,
        target_field: r.target_field!,
        condition: JSON.stringify(r.condition || {}),
        params: JSON.stringify(r.params || {}),
        problem_template: r.problem_template || defaultProblemTemplate(r),
        explanation_template: r.explanation_template || defaultExplanationTemplate(r),
        suggested_actions: JSON.stringify(
          r.suggested_actions || defaultActionsForRule(r, { accounts, companies: [] })
        ),
        severity: r.severity || 'warning',
        is_active: r.is_active !== false,
        auto_apply: Boolean(r.auto_apply),
        is_deleted: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

    let created = 0;
    for (const rule of toCreate) {
      await repo.create('DataQualityRules', rule);
      created++;
    }

    return NextResponse.json({ success: true, created, skipped: SEED_RULES.length - created });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
