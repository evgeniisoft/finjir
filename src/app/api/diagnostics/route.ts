import { NextRequest, NextResponse } from 'next/server';
import { diagnosticsEngine } from '@/lib/diagnostics/engine';
import { DiagnosticContext } from '@/lib/diagnostics/types';
import { loadSystemAccounts, getSystemAccounts } from '@/lib/config/accounts';
import { taxEngine } from '@/lib/engine/tax';
import { getRepository } from '@/lib/dal/repository';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const url = new URL(request.url);
    const year = url.searchParams.get('year') || String(new Date().getFullYear());

    const periodStart = `${year}-01-01`;
    const periodEnd = `${year}-12-31`;
    const today = new Date().toISOString().split('T')[0];

    const checkConsistency = url.searchParams.get('consistency') !== 'false';
    const checkInfrastructure = url.searchParams.get('infrastructure') !== 'false';
    const checkBusinessRules = url.searchParams.get('business') !== 'false';

    // Загрузка данных через репозиторий
    const loadStart = Date.now();
    const repo = getRepository();
    const [transactions, accounts, companies, counterparties, budgets, settings] = await Promise.all([
      repo.getAll('Transactions'),
      repo.getAll('Accounts'),
      repo.getAll('Companies'),
      repo.getAll('Counterparties'),
      repo.getAll('Budgets'),
      repo.getAll('Settings'),
    ]);
    const gasLoadTime = Date.now() - loadStart;

    loadSystemAccounts(settings);
    await taxEngine.loadSettings(settings);

    const settingsMap: any = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    const context: DiagnosticContext = {
      transactions,
      accounts,
      companies,
      counterparties,
      budgets,
      settings: settingsMap,
      systemAccounts: getSystemAccounts(),
      periodStart,
      periodEnd,
      today,
      startTime,
      gasLoadTime,
      options: {
        checkConsistency,
        checkInfrastructure,
        checkBusinessRules,
      },
    };

    const result = await diagnosticsEngine.run(context);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Ошибка диагностики:', error);
    return NextResponse.json(
      {
        error: 'Внутренняя ошибка: ' + error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
