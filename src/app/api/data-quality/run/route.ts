import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';
import { dataQualityEngine } from '@/lib/data-quality/engine';
import { DataQualityRunResult } from '@/lib/data-quality/types';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const repo = getRepository();
    const [rulesRaw, exceptionsRaw, transactions, accounts, companies, budgets] = await Promise.all([
      repo.getAll('DataQualityRules'),
      repo.getAll('DataQualityExceptions'),
      repo.getAll('Transactions'),
      repo.getAll('Accounts'),
      repo.getAll('Companies'),
      repo.getAll('Budgets'),
    ]);

    const rules = rulesRaw
      .filter((r: any) => !r.is_deleted && r.is_active)
      .map((r: any) => ({
        ...r,
        condition: parseJson(r.condition),
        params: parseJson(r.params),
        suggested_actions: parseJson(r.suggested_actions),
      }));

    const exceptions = exceptionsRaw;

    const violations = dataQualityEngine.run(
      rules,
      { transactions, accounts, companies, budgets },
      exceptions,
    );

    const summary = {
      total: violations.length,
      critical: violations.filter(v => v.severity === 'critical').length,
      warning: violations.filter(v => v.severity === 'warning').length,
      info: violations.filter(v => v.severity === 'info').length,
      rules_applied: rules.length,
      rules_skipped: rulesRaw.length - rules.length,
    };

    const result: DataQualityRunResult = { violations, summary };
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function parseJson(s: any): any {
  if (!s) return null;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return null; }
}
