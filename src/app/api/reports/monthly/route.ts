import { NextRequest, NextResponse } from 'next/server';
import { monthlyEngine } from '@/lib/engine/monthly';
import { taxEngine } from '@/lib/engine/tax';
import { getRepository } from '@/lib/dal/repository';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get('company_id') || '';
    const periodStart = url.searchParams.get('period_start') || '2026-01-01';
    const periodEnd = url.searchParams.get('period_end') || '2026-12-31';
    const periodType = url.searchParams.get('period_type') || 'monthly';
    const reportType = url.searchParams.get('report_type') || 'pnl';

    const repo = getRepository();
    const [transactions, accounts, companies, settings] = await Promise.all([
      repo.getAll('Transactions'),
      repo.getAll('Accounts'),
      repo.getAll('Companies'),
      repo.getAll('Settings'),
    ]);

    await taxEngine.loadSettings(settings);

    let data;

    if (companyId) {
      const company = companies.find((c: any) => c.id === companyId);
      data = monthlyEngine.getPeriodBreakdown(
        transactions,
        accounts,
        companyId,
        periodStart,
        periodEnd,
        periodType as any,
        company,
        reportType as any
      );
    } else {
      const allData = companies.flatMap((company: any) =>
        monthlyEngine.getPeriodBreakdown(
          transactions,
          accounts,
          company.id,
          periodStart,
          periodEnd,
          periodType as any,
          company,
          reportType as any
        )
      );
      const periodsMap = new Map<string, any>();

      for (const item of allData) {
        if (!periodsMap.has(item.period)) {
          periodsMap.set(item.period, {
            period: item.period,
            revenue: 0,
            expenses: 0,
            profit: 0,
            cash_in: 0,
            cash_out: 0,
            net_cash_flow: 0,
            starting_balance: 0,
            ending_balance: 0,
            tax_outflow: 0,
            details: {},
          });
        }
        const existing = periodsMap.get(item.period)!;
        existing.revenue += item.revenue;
        existing.expenses += item.expenses;
        existing.profit += item.profit;
        existing.cash_in += item.cash_in;
        existing.cash_out += item.cash_out;
        existing.net_cash_flow += item.net_cash_flow;
        existing.starting_balance += item.starting_balance || 0;
        existing.ending_balance += item.ending_balance;
        existing.tax_outflow += item.tax_outflow || 0;

        for (const [accId, amount] of Object.entries(item.details)) {
          existing.details[accId] = (existing.details[accId] || 0) + (amount as number);
        }
      }

      data = Array.from(periodsMap.values())
        .sort((a, b) => a.period.localeCompare(b.period));

      for (let i = 0; i < data.length; i++) {
        if (i === 0) {
          data[i].ending_balance = data[i].starting_balance + data[i].cash_in - data[i].cash_out - (data[i].tax_outflow || 0);
        } else {
          data[i].starting_balance = data[i - 1].ending_balance;
          data[i].ending_balance = data[i].starting_balance + data[i].cash_in - data[i].cash_out - (data[i].tax_outflow || 0);
        }
      }
    }

    return NextResponse.json({
      periods: data,
      accounts: accounts,
      report_type: reportType,
    });

  } catch (error: any) {
    console.error('Ошибка API:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 }
    );
  }
}
