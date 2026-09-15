import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const accountId = url.searchParams.get('account_id') || '';
    const rowType = url.searchParams.get('type') || 'all';
    const periodStart = url.searchParams.get('period_start') || '2026-01-01';
    const periodEnd = url.searchParams.get('period_end') || '2026-12-31';
    const companyId = url.searchParams.get('company_id') || '';

    const repo = getRepository();
    const [transactions, accounts] = await Promise.all([
      repo.getAll('Transactions'),
      repo.getAll('Accounts'),
    ]);

    let filtered = transactions.filter((t: any) => {
      const txDate = t.date?.split('T')[0] || t.date;
      return txDate >= periodStart && txDate <= periodEnd;
    });

    if (companyId) {
      filtered = filtered.filter((t: any) => t.company_id === companyId);
    }

    switch (rowType) {
      case 'income':
        filtered = filtered.filter((t: any) => {
          const creditAcc = accounts.find((a: any) => a.id === t.credit_account_id);
          return creditAcc?.type === 'I';
        });
        break;

      case 'cogs':
        filtered = filtered.filter((t: any) => {
          const debitAcc = accounts.find((a: any) => a.id === t.debit_account_id);
          return Boolean(debitAcc?.is_cost_of_goods);
        });
        break;

      case 'cash_in_operating':
        filtered = filtered.filter((t: any) => {
          const debitAcc = accounts.find((a: any) => a.id === t.debit_account_id);
          const creditAcc = accounts.find((a: any) => a.id === t.credit_account_id);
          if (!(Boolean(debitAcc?.is_cash_flow))) return false;
          if (creditAcc?.type === 'I') return true;
          return false;
        });
        break;

      case 'cash_out_operating':
        filtered = filtered.filter((t: any) => {
          const debitAcc = accounts.find((a: any) => a.id === t.debit_account_id);
          const creditAcc = accounts.find((a: any) => a.id === t.credit_account_id);
          if (!(Boolean(creditAcc?.is_cash_flow))) return false;
          if (debitAcc?.type === 'X' && !debitAcc.id.startsWith('acc-tax-')) return true;
          return false;
        });
        break;

      case 'cash_in_investing':
        filtered = filtered.filter((t: any) => {
          const debitAcc = accounts.find((a: any) => a.id === t.debit_account_id);
          const creditAcc = accounts.find((a: any) => a.id === t.credit_account_id);
          if (!(Boolean(debitAcc?.is_cash_flow))) return false;
          if (creditAcc?.activity_type === 'investing') return true;
          if (creditAcc?.id === 'acc-in-invest-sale') return true;
          return false;
        });
        break;

      case 'cash_out_investing':
        filtered = filtered.filter((t: any) => {
          const debitAcc = accounts.find((a: any) => a.id === t.debit_account_id);
          const creditAcc = accounts.find((a: any) => a.id === t.credit_account_id);
          if (!(Boolean(creditAcc?.is_cash_flow))) return false;
          if (debitAcc?.activity_type === 'investing') return true;
          if (debitAcc?.id === 'acc-out-capex') return true;
          return false;
        });
        break;

      case 'cash_in_financing':
        filtered = filtered.filter((t: any) => {
          const debitAcc = accounts.find((a: any) => a.id === t.debit_account_id);
          const creditAcc = accounts.find((a: any) => a.id === t.credit_account_id);
          if (!(Boolean(debitAcc?.is_cash_flow))) return false;
          if (creditAcc?.activity_type === 'financing') return true;
          if (creditAcc?.id === 'acc-in-loan') return true;
          return false;
        });
        break;

      case 'cash_out_financing':
        filtered = filtered.filter((t: any) => {
          const debitAcc = accounts.find((a: any) => a.id === t.debit_account_id);
          const creditAcc = accounts.find((a: any) => a.id === t.credit_account_id);
          if (!(Boolean(creditAcc?.is_cash_flow))) return false;
          if (debitAcc?.activity_type === 'financing') return true;
          if (debitAcc?.id === 'acc-out-loan-principal' ||
            debitAcc?.id === 'acc-out-loan-interest' ||
            debitAcc?.id === 'acc-out-dividends') return true;
          return false;
        });
        break;

      case 'opex':
        filtered = filtered.filter((t: any) => {
          const debitAcc = accounts.find((a: any) => a.id === t.debit_account_id);
          if (!debitAcc || debitAcc.type !== 'X') return false;
          if (Boolean(debitAcc.is_cost_of_goods)) return false;
          if (debitAcc.id.startsWith('acc-tax-')) return false;
          if (debitAcc.id.startsWith('acc-depreciation-')) return false;
          return true;
        });
        break;

      case 'expense':
        filtered = filtered.filter((t: any) => t.type === 'expense');
        break;

      case 'all':
      default:
        if (accountId && accountId.startsWith('acc-')) {
          filtered = filtered.filter((t: any) =>
            t.debit_account_id === accountId || t.credit_account_id === accountId
          );
        }
        break;
    }

    if (accountId && accountId.startsWith('acc-') && rowType !== 'cogs' && rowType !== 'opex') {
      filtered = filtered.filter((t: any) =>
        t.debit_account_id === accountId || t.credit_account_id === accountId
      );
    }

    const enriched = filtered.map((t: any) => {
      const debitAccount = accounts.find((a: any) => a.id === t.debit_account_id);
      const creditAccount = accounts.find((a: any) => a.id === t.credit_account_id);
      return {
        ...t,
        debit_account_name: debitAccount?.name || t.debit_account_id,
        credit_account_name: creditAccount?.name || t.credit_account_id,
      };
    });

    return NextResponse.json(enriched);

  } catch (error: any) {
    console.error('Ошибка API:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 }
    );
  }
}
