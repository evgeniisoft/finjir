import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';
import { dataQualityEngine } from '@/lib/data-quality/engine';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const repo = getRepository();
    const [rulesRaw, exceptions, transactions, accounts, companies, budgets] = await Promise.all([
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

    const violations = dataQualityEngine.run(
      rules,
      { transactions, accounts, companies, budgets },
      exceptions,
    );

    // CSV
    const header = ['rule_name', 'severity', 'entity_id', 'date', 'description', 'amount', 'account'];
    const rows = violations.map(v => {
      const acc = accounts.find((a: any) => a.id === v.entity.debit_account_id);
      return [
        v.rule_name,
        v.severity,
        v.entity_id,
        v.entity.date?.split('T')[0] || '',
        (v.entity.description || '').replace(/"/g, '""'),
        v.entity.amount_rub || v.entity.amount || 0,
        acc?.name || '',
      ].map(x => `"${x}"`).join(',');
    });

    const csv = [header.join(','), ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="data-quality-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function parseJson(s: any): any {
  if (!s) return null;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return null; }
}
