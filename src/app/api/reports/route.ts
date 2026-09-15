import { NextRequest, NextResponse } from 'next/server';
import { calculator } from '@/lib/engine/calculator';
import { consolidationEngine } from '@/lib/engine/consolidation';
import { taxEngine } from '@/lib/engine/tax';
import { loadSystemAccounts } from '@/lib/config/accounts';
import { dataCache, CACHE_PREFIXES } from '@/lib/cache';
import { getRepository } from '@/lib/dal/repository';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const reportType = url.searchParams.get('type') || 'pnl';
    const companyId = url.searchParams.get('company_id');
    const periodStart = url.searchParams.get('period_start') || '2026-01-01';
    const periodEnd = url.searchParams.get('period_end') || '2026-12-31';

    // Проверяем кэш
    const cacheKey = `${CACHE_PREFIXES.REPORTS}_${reportType}_${companyId || 'all'}_${periodStart}_${periodEnd}`;
    const cached = dataCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Читаем данные через репозиторий
    const repo = getRepository();
    const [transactions, accounts, companies, settings] = await Promise.all([
      repo.getAll('Transactions'),
      repo.getAll('Accounts'),
      repo.getAll('Companies'),
      repo.getAll('Settings'),
    ]);

    await taxEngine.loadSettings(settings);
    loadSystemAccounts(settings);

    console.log('Transactions:', transactions.length);
    console.log('Accounts:', accounts.length);
    console.log('Companies:', companies.length);

    if (!companies || companies.length === 0) {
      return NextResponse.json([]);
    }

    let targetCompanies = companies;
    if (companyId) {
      targetCompanies = companies.filter((c: any) => c.id === companyId);
    }

    switch (reportType) {
      case 'pnl': {
        const reports = targetCompanies.map((company: any) => {
          const pnl = calculator.calculatePnL(
            transactions, accounts, company.id,
            periodStart, periodEnd, company
          );
          const tax = taxEngine.calculateTax(
            company, transactions, accounts,
            periodStart, periodEnd
          );
          return { company, report: pnl, tax };
        });
        dataCache.set(cacheKey, reports, 300);
        return NextResponse.json(reports);
      }

      case 'cashflow': {
        const reports = targetCompanies.map((company: any) => ({
          company,
          report: calculator.calculateCashFlow(
            transactions, accounts, company.id,
            periodStart, periodEnd, company
          ),
        }));
        dataCache.set(cacheKey, reports, 300);
        return NextResponse.json(reports);
      }

      case 'balance': {
        const reports = targetCompanies.map((company: any) => ({
          company,
          report: calculator.calculateBalanceSheet(
            transactions, accounts, company.id,
            periodEnd, company
          ),
        }));
        dataCache.set(cacheKey, reports, 300);
        return NextResponse.json(reports);
      }

      case 'consolidated': {
        const consolidated = {
          pnl: consolidationEngine.consolidatePnL(
            targetCompanies, transactions, accounts,
            periodStart, periodEnd
          ),
          cashFlow: consolidationEngine.consolidateCashFlow(
            targetCompanies, transactions, accounts,
            periodStart, periodEnd
          ),
          balance: consolidationEngine.consolidateBalanceSheet(
            targetCompanies, transactions, accounts,
            periodEnd
          ),
        };
        return NextResponse.json(consolidated);
      }

      case 'transactions': {
        return NextResponse.json(transactions);
      }

      default: {
        return NextResponse.json([]);
      }
    }

  } catch (error: any) {
    console.error('Ошибка API:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 }
    );
  }
}
