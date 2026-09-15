import { NextRequest, NextResponse } from 'next/server';
import { budgetEngine } from '@/lib/engine/budget';
import { taxEngine } from '@/lib/engine/tax';
import { loadSystemAccounts } from '@/lib/config/accounts';
import { getRepository } from '@/lib/dal/repository';
import { dataCache, CACHE_PREFIXES } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get('company_id');
    const scenario = url.searchParams.get('scenario') || 'base';
    const year = url.searchParams.get('year') || '2026';

    const repo = getRepository();
    const [budgets, transactions, accounts, companies, settings] = await Promise.all([
      repo.getAll('Budgets'),
      repo.getAll('Transactions'),
      repo.getAll('Accounts'),
      repo.getAll('Companies'),
      repo.getAll('Settings'),
    ]);

    loadSystemAccounts(settings);

    // Фильтруем бюджеты
    let filteredBudgets = budgets.filter((b: any) => b.scenario === scenario);

    if (companyId) {
      filteredBudgets = filteredBudgets.filter((b: any) => b.company_id === companyId);
    } else {
      // Агрегация по всем компаниям
      const aggregated = new Map<string, any>();
      for (const budget of filteredBudgets) {
        const key = `${budget.category_id}_${budget.period}`;
        if (!aggregated.has(key)) {
          aggregated.set(key, { ...budget });
        } else {
          const existing = aggregated.get(key);
          existing.planned_amount = (existing.planned_amount || 0) + (budget.planned_amount || 0);
          existing.actual_amount = (existing.actual_amount || 0) + (budget.actual_amount || 0);
        }
      }
      filteredBudgets = Array.from(aggregated.values());
    }

    // Считаем факт по месяцам
    const actualsByCategory = new Map<string, Map<string, number>>();
    for (const tx of transactions) {
      const txDate = typeof tx.date === 'string'
        ? tx.date.split('T')[0]
        : new Date(tx.date).toISOString().split('T')[0];
      const month = txDate.substring(0, 7);
      const catId = tx.type === 'income'
        ? tx.credit_account_id
        : tx.type === 'expense'
          ? tx.debit_account_id
          : '';

      if (!catId) continue;

      if (!actualsByCategory.has(catId)) {
        actualsByCategory.set(catId, new Map());
      }
      const currentAmount = actualsByCategory.get(catId)!.get(month) || 0;
      actualsByCategory.get(catId)!.set(month, currentAmount + parseFloat(String(tx.amount || 0)));
    }

    return NextResponse.json({
      budgets: filteredBudgets,
      transactions,
      accounts,
      companies,
      actualsByCategory: Object.fromEntries(
        Array.from(actualsByCategory.entries()).map(([catId, monthsMap]) => [
          catId,
          Object.fromEntries(monthsMap),
        ])
      ),
    });

  } catch (error: any) {
    console.error('Ошибка API budget GET:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;
    const repo = getRepository();

    if (action === 'create_budget') {
      const result = await repo.create('Budgets', body.data);
      dataCache.invalidate(CACHE_PREFIXES.DATA);
      dataCache.invalidate(CACHE_PREFIXES.REPORTS);
      return NextResponse.json(result);
    }

    if (action === 'close_month') {
      const { companyId, period, scenario } = body;
      const allBudgets = await repo.getAll('Budgets');

      // Проверка предыдущего месяца
      const periodDate = new Date(period + '-01');
      const prevDate = new Date(periodDate.getFullYear(), periodDate.getMonth() - 1, 1);
      const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

      const prevBudgets = allBudgets.filter((b: any) =>
        b.company_id === companyId &&
        String(b.period || '').substring(0, 7) === prevPeriod &&
        b.scenario === scenario
      );
      const prevClosed = prevBudgets.length === 0 || prevBudgets.every((b: any) => b.status === 'closed');

      if (!prevClosed) {
        return NextResponse.json({ error: `Сначала закройте ${prevPeriod}` }, { status: 400 });
      }

      // Бюджеты месяца
      const monthBudgets = allBudgets.filter((b: any) =>
        b.company_id === companyId &&
        String(b.period || '').substring(0, 7) === period &&
        b.scenario === scenario &&
        b.status !== 'closed'
      );

      // Транзакции за месяц
      const transactions = await repo.getAll('Transactions');
      const monthTx = transactions.filter((t: any) => {
        const txDate = typeof t.date === 'string'
          ? t.date.split('T')[0]
          : new Date(t.date).toISOString().split('T')[0];
        return t.company_id === companyId && txDate.substring(0, 7) === period;
      });

      let updated = 0;
      for (const budget of monthBudgets) {
        const catId = budget.category_id || budget.account_id;
        const actualTx = monthTx.filter((t: any) =>
          t.debit_account_id === catId || t.credit_account_id === catId
        );
        const actualAmount = actualTx.reduce(
          (s: number, t: any) => s + parseFloat(String(t.amount || 0)), 0
        );

        await repo.update('Budgets', budget.id, {
          actual_amount: actualAmount,
          status: 'closed',
        });
        updated++;
      }

      // Скользящее планирование: создаём пустые бюджеты на месяц +12
      const closedYear = parseInt(period.substring(0, 4));
      const closedMonth = parseInt(period.substring(5, 7));
      const horizonEnd = new Date(closedYear, closedMonth + 12, 1);
      const newPeriod = `${horizonEnd.getFullYear()}-${String(horizonEnd.getMonth() + 1).padStart(2, '0')}`;

      const accounts = await repo.getAll('Accounts');
      const incomeExpenseAccounts = accounts.filter((a: any) => a.type === 'I' || a.type === 'X');

      const now = new Date().toISOString();
      for (const account of incomeExpenseAccounts) {
        await repo.create('Budgets', {
          tenant_id: 'tenant-1',
          company_id: companyId,
          category_id: account.id,
          account_id: account.id,
          period: newPeriod,
          planned_amount: 0,
          actual_amount: null,
          record_type: 'pnl',
          scenario: scenario,
          status: 'draft',
          payment_delay_days: null,
          is_deleted: '',
          deleted_at: null,
          created_at: now,
          updated_at: now,
        });
      }

      dataCache.invalidate(CACHE_PREFIXES.DATA);
      dataCache.invalidate(CACHE_PREFIXES.REPORTS);
      return NextResponse.json({ success: true, updated, new_period: newPeriod });
    }

    if (action === 'update_cell') {
      const { companyId, categoryId, period, plannedAmount, scenario } = body;

      // Обновление по ID
      if (body.budgetId) {
        await repo.update('Budgets', body.budgetId, { planned_amount: plannedAmount });
        dataCache.invalidate(CACHE_PREFIXES.DATA);
        dataCache.invalidate(CACHE_PREFIXES.REPORTS);
        return NextResponse.json({ success: true });
      }

      // Иначе ищем по компании + статье + периоду
      const allBudgets = await repo.getAll('Budgets');
      const existing = allBudgets.find((b: any) =>
        b.company_id === companyId &&
        b.category_id === categoryId &&
        String(b.period || '').substring(0, 7) === period.substring(0, 7) &&
        b.scenario === scenario
      );

      if (existing) {
        await repo.update('Budgets', existing.id, { planned_amount: plannedAmount });
      } else {
        const now = new Date().toISOString();
        await repo.create('Budgets', {
          tenant_id: 'tenant-1',
          company_id: companyId,
          category_id: categoryId,
          account_id: categoryId,
          period: period.substring(0, 7),
          planned_amount: plannedAmount,
          actual_amount: null,
          record_type: 'pnl',
          scenario: scenario,
          status: 'draft',
          payment_delay_days: null,
          is_deleted: '',
          deleted_at: null,
          created_at: now,
          updated_at: now,
        });
      }

      dataCache.invalidate(CACHE_PREFIXES.DATA);
      dataCache.invalidate(CACHE_PREFIXES.REPORTS);
      return NextResponse.json({ success: true });
    }

    if (action === 'auto_fill') {
      const companyId = body.companyId;
      const year = body.year || '2026';

      if (!companyId) {
        return NextResponse.json({ error: 'Не указана компания' }, { status: 400 });
      }

      const [transactions, accounts, companies] = await Promise.all([
        repo.getAll('Transactions'),
        repo.getAll('Accounts'),
        repo.getAll('Companies'),
      ]);

      const budgets = budgetEngine.autoFillBudget(companyId, year, accounts, transactions);

      // Налоговый календарь
      const company = companies.find((c: any) => c.id === companyId);
      if (company) {
        const budgetMonths = budgets.map((b: any) => String(b.period || ''));
        const taxCalendar = taxEngine.getMonthlyTaxCalendar(company, year, budgets, budgetMonths);

        for (const monthData of taxCalendar) {
          for (const [taxAccountId, taxAmount] of Object.entries(monthData.taxes)) {
            if ((taxAmount as number) > 0) {
              budgets.push({
                id: '',
                tenant_id: 'tenant-1',
                company_id: companyId,
                category_id: taxAccountId,
                account_id: taxAccountId,
                period: monthData.month,
                planned_amount: taxAmount as number,
                actual_amount: 0,
                record_type: 'pnl',
                scenario: 'base',
                status: 'draft',
                payment_delay_days: 0,
                is_deleted: '',
                deleted_at: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } as any);
            }
          }
        }
      }

      // Убираем апострофы (если есть)
      budgets.forEach((b: any) => {
        b.period = String(b.period || '').replace(/^'/, '').substring(0, 7);
      });

      // Сохраняем батчами
      const toCreate = budgets.map((b: any) => {
        const clean: any = { ...b };
        delete clean.id;
        if (clean.deleted_at === '') clean.deleted_at = null;
        if (clean.actual_amount === '') clean.actual_amount = null;
        if (clean.payment_delay_days === '') clean.payment_delay_days = null;
        return clean;
      });

      // Батчами по 50 (Prisma не любит слишком большие createMany)
      let total = 0;
      for (let i = 0; i < toCreate.length; i += 50) {
        const chunk = toCreate.slice(i, i + 50);
        const result = await repo.batchCreate('Budgets', chunk);
        total += result.count || chunk.length;
      }

      dataCache.invalidate(CACHE_PREFIXES.DATA);
      dataCache.invalidate(CACHE_PREFIXES.REPORTS);
      return NextResponse.json({ success: true, count: total });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error: any) {
    console.error('Ошибка API budget POST:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 }
    );
  }
}
