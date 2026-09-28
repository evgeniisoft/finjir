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

    // Разделяем на активные и удалённые по имени
    const activeNames = new Set(
      existing.filter((r: any) => r.is_deleted !== 'true').map((r: any) => r.name)
    );
    const deletedByName = new Map<string, any>();
    for (const r of existing) {
      if (r.is_deleted === 'true') {
        deletedByName.set(r.name, r);
      }
    }

    let created = 0;
    let restored = 0;
    let skipped = 0;

    for (const seedRule of SEED_RULES) {
      const name = seedRule.name!;

      if (activeNames.has(name)) {
        skipped++;
        continue;
      }

      const existingDeleted = deletedByName.get(name);
      if (existingDeleted) {
        await repo.update('DataQualityRules', existingDeleted.id, {
          is_deleted: '',
          deleted_at: null,
          is_active: true,
          updated_at: new Date().toISOString(),
        });
        restored++;
        continue;
      }

      const toCreate = {
        tenant_id: 'tenant-1',
        name,
        description: seedRule.description || null,
        category: seedRule.category || 'general',
        rule_type: seedRule.rule_type!,
        entity_type: seedRule.entity_type!,
        target_field: seedRule.target_field!,
        condition: JSON.stringify(seedRule.condition || {}),
        params: JSON.stringify(seedRule.params || {}),
        problem_template: seedRule.problem_template || defaultProblemTemplate(seedRule),
        explanation_template: seedRule.explanation_template || defaultExplanationTemplate(seedRule),
        suggested_actions: JSON.stringify(
          seedRule.suggested_actions || defaultActionsForRule(seedRule, { accounts, companies: [] })
        ),
        severity: seedRule.severity || 'warning',
        is_active: seedRule.is_active !== false,
        auto_apply: Boolean(seedRule.auto_apply),
        is_deleted: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await repo.create('DataQualityRules', toCreate);
      created++;
    }

    return NextResponse.json({
      success: true,
      created,
      restored,
      skipped,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
