/**
 * ============================================
 * FinEngine 2026 - Калькулятор отчётов
 * ============================================
 * Рассчитывает ДДС, ОПиУ, Баланс на основе операций.
 */

import {
  Transaction,
  Account,
  CashFlowReport,
  PnLReport,
  BalanceSheet,
  JournalEntry
} from './types';
import { taxEngine } from './tax';
import { getSystemAccount } from '@/lib/config/accounts';
import { isOpexAccount, isRevenueAccount, isCogsAccount } from './opex-filter';

export class FinancialCalculator {

  /**
   * Создание проводок из операции (двойная запись)
   */
  createJournalEntries(transaction: Transaction): JournalEntry[] {
    const entries: JournalEntry[] = [];

    entries.push({
      id: this.generateId(),
      transaction_id: transaction.id,
      date: transaction.date,
      company_id: transaction.company_id,
      account_id: transaction.debit_account_id,
      debit: transaction.amount,
      credit: 0,
      currency: transaction.currency,
      amount_rub: transaction.amount_rub
    });

    entries.push({
      id: this.generateId(),
      transaction_id: transaction.id,
      date: transaction.date,
      company_id: transaction.company_id,
      account_id: transaction.credit_account_id,
      debit: 0,
      credit: transaction.amount,
      currency: transaction.currency,
      amount_rub: transaction.amount_rub
    });

    return entries;
  }

  /**
   * Расчёт EBITDA
   * EBITDA = Чистая прибыль + Налог на прибыль + Амортизация
   */
  calculateEBITDA(pnl: PnLReport, taxCalc: any): number {
    const netProfit = pnl.net_profit || 0;
    const incomeTax = taxCalc?.income_tax_amount || 0;
    const depreciation = pnl.depreciation || 0;
    return netProfit + incomeTax + depreciation;
  }

  /**
   * Расчёт ДДС (Cash Flow)
   */
  calculateCashFlow(
    transactions: Transaction[],
    accounts: Account[],
    companyId: string,
    periodStart: string,
    periodEnd: string,
    company?: any
  ): CashFlowReport {

    const filtered = transactions.filter(t => {
      const txDate = typeof t.date === 'string' ? t.date.split('T')[0] : String(t.date || '').split('T')[0];
      return t.company_id === companyId &&
        txDate >= periodStart &&
        txDate <= periodEnd;
    });

    const beforePeriod = transactions.filter(t => {
      const txDate = typeof t.date === 'string' ? t.date.split('T')[0] : String(t.date || '').split('T')[0];
      return t.company_id === companyId && txDate < periodStart;
    });

    const startingBalance = this.calculateBalance(beforePeriod, accounts);

    let operatingInflow = 0;
    let operatingOutflow = 0;
    let investingInflow = 0;
    let investingOutflow = 0;
    let financingInflow = 0;
    let financingOutflow = 0;
    let taxOutflow = 0;

    for (const t of filtered) {
      const debitAccount = accounts.find(a => a.id === t.debit_account_id);
      const creditAccount = accounts.find(a => a.id === t.credit_account_id);

      if (!debitAccount || !creditAccount) continue;

      const debitIsCash = Boolean(debitAccount.is_cash_flow);
      const creditIsCash = Boolean(creditAccount.is_cash_flow);

      // Внутреннее перемещение (оба счёта денежные) — пропускаем
      if (debitIsCash && creditIsCash) continue;

      // Поступление (деньги пришли на денежный счёт)
      if (debitIsCash && !creditIsCash) {
        if (creditAccount.type === 'I') {
          operatingInflow += t.amount_rub;
        } else if (creditAccount.activity_type === 'investing' || creditAccount.id === 'acc-in-invest-sale') {
          investingInflow += t.amount_rub;
        } else if (creditAccount.activity_type === 'financing' || creditAccount.id === 'acc-in-loan') {
          financingInflow += t.amount_rub;
        } else if (creditAccount.type === 'A') {
          investingInflow += t.amount_rub;
        } else {
          operatingInflow += t.amount_rub;
        }
      }

      // Выбытие (деньги ушли с денежного счёта)
      if (creditIsCash && !debitIsCash) {
        // Налоговые платежи — в taxOutflow
        if (debitAccount.id.startsWith('acc-tax-')) {
          taxOutflow += t.amount_rub;
        } else if (debitAccount.type === 'X') {
          operatingOutflow += t.amount_rub;
        } else if (debitAccount.activity_type === 'investing' || debitAccount.id === 'acc-out-capex') {
          investingOutflow += t.amount_rub;
        } else if (debitAccount.activity_type === 'financing' ||
          debitAccount.id === 'acc-out-loan-principal' ||
          debitAccount.id === 'acc-out-loan-interest' ||
          debitAccount.id === 'acc-out-dividends') {
          financingOutflow += t.amount_rub;
        } else if (debitAccount.type === 'A') {
          investingOutflow += t.amount_rub;
        } else {
          operatingOutflow += t.amount_rub;
        }
      }
    }

    const endingBalance = startingBalance +
      operatingInflow - operatingOutflow +
      investingInflow - investingOutflow +
      financingInflow - financingOutflow -
      taxOutflow;

    return {
      period_start: periodStart,
      period_end: periodEnd,
      company_id: companyId,
      starting_balance: startingBalance,
      operating_inflow: operatingInflow,
      operating_outflow: operatingOutflow,
      investing_inflow: investingInflow,
      investing_outflow: investingOutflow,
      financing_inflow: financingInflow,
      financing_outflow: financingOutflow,
      tax_outflow: taxOutflow,
      ending_balance: endingBalance,
    };
  }

  /**
   * Расчёт ОПиУ (P&L)
   */
  calculatePnL(
    transactions: Transaction[],
    accounts: Account[],
    companyId: string,
    periodStart: string,
    periodEnd: string,
    company?: any
  ): PnLReport {

    const filtered = transactions.filter(t => {
      const txDate = typeof t.date === 'string' ? t.date.split('T')[0] : String(t.date || '').split('T')[0];
      return t.company_id === companyId &&
        txDate >= periodStart &&
        txDate <= periodEnd;
    });

    let costOfGoodsSold = 0;
    let operatingExpenses = 0;
    let depreciation = 0;
    let taxes = 0;

    const taxCalc = taxEngine.calculateTax(company, transactions, accounts, periodStart, periodEnd);
    const revenue = taxCalc.revenue_without_vat;

    const vatIncluded = String(company?.vat_included).toLowerCase() === 'true';
    const vatRate = parseFloat(String(company?.vat_rate || '0'));

    for (const t of filtered) {
      const debitAccount = accounts.find(a => a.id === t.debit_account_id);
      const creditAccount = accounts.find(a => a.id === t.credit_account_id);

      if (!debitAccount || !creditAccount) continue;

      if (isCogsAccount(debitAccount)) {
        let expenseAmount = t.amount_rub || 0;
        if (vatIncluded && vatRate > 0) {
          expenseAmount = expenseAmount / (1 + vatRate);
        }
        costOfGoodsSold += expenseAmount;
        continue;
      }

      // Амортизация — не облагается НДС, корректировка не применяется
      if (debitAccount.type === 'X' && debitAccount.id.startsWith('acc-depreciation-')) {
        depreciation += t.amount_rub || 0;
        continue;
      }

      if (isOpexAccount(debitAccount)) {
        let expenseAmount = t.amount_rub || 0;
        if (vatIncluded && vatRate > 0) {
          expenseAmount = expenseAmount / (1 + vatRate);
        }
        operatingExpenses += expenseAmount;
      }
    }

    const taxesAmount = taxCalc.income_tax_amount;
    taxes = taxesAmount;

    const grossProfit = revenue - costOfGoodsSold;
    const netProfit = grossProfit - operatingExpenses - taxCalc.insurance_amount - taxCalc.ndfl_amount - depreciation - taxesAmount;

    return {
      period_start: periodStart,
      period_end: periodEnd,
      company_id: companyId,
      revenue,
      cost_of_goods_sold: costOfGoodsSold,
      gross_profit: grossProfit,
      operating_expenses: operatingExpenses,
      insurance_amount: taxCalc.insurance_amount,
      ndfl_amount: taxCalc.ndfl_amount,
      depreciation,
      taxes,
      net_profit: netProfit
    };
  }

  /**
   * Расчёт Баланса (sync).
   *
   * ОС считаются из транзакций. Если нужен источник 'registry' —
   * используйте async-обёртку calculateBalanceSheetAsync, которая
   * заранее рассчитает ОС из справочника и передаст сюда.
   */
  calculateBalanceSheet(
    transactions: Transaction[],
    accounts: Account[],
    companyId: string,
    date: string,
    company?: any,
    settings?: any[],
    registryFixedAssets?: number,
  ): BalanceSheet {

    const filtered = transactions.filter(t => {
      const txDate = typeof t.date === 'string' ? t.date.split('T')[0] : String(t.date || '').split('T')[0];
      return t.company_id === companyId && txDate <= date;
    });

    let cash = 0;
    let accountsReceivable = 0;
    let inventory = 0;
    let fixedAssets = 0;
    let accountsPayable = 0;
    let loans = 0;
    let capital = 0;

    const fixedAssetsAccount = getSystemAccount('fixed_assets');

    for (const t of filtered) {
      const debitAccount = accounts.find(a => a.id === t.debit_account_id);
      const creditAccount = accounts.find(a => a.id === t.credit_account_id);

      if (!debitAccount || !creditAccount) continue;

      const debitIsCash = Boolean(debitAccount.is_cash_flow);
      const creditIsCash = Boolean(creditAccount.is_cash_flow);

      if (debitIsCash) cash += t.amount_rub;
      if (creditIsCash) cash -= t.amount_rub;

      const arAccount = getSystemAccount('ar');
      if (t.debit_account_id === arAccount) accountsReceivable += t.amount_rub;
      if (t.credit_account_id === arAccount) accountsReceivable -= t.amount_rub;

      if (debitAccount.code === 'INVENTORY') inventory += t.amount_rub;
      if (creditAccount.code === 'INVENTORY') inventory -= t.amount_rub;

      // ОС из транзакций (включая plan — синхронно с ДДС и ОПиУ)
      if (
        debitAccount.code === 'FA' ||
        debitAccount.code === 'FIXED_ASSETS' ||
        debitAccount.id === fixedAssetsAccount
      ) {
        fixedAssets += t.amount_rub;
      }
      if (
        creditAccount.code === 'FA' ||
        creditAccount.code === 'FIXED_ASSETS' ||
        creditAccount.id === fixedAssetsAccount
      ) {
        fixedAssets -= t.amount_rub;
      }

      const apAccount = getSystemAccount('ap');
      if (t.credit_account_id === apAccount) accountsPayable += t.amount_rub;
      if (t.debit_account_id === apAccount) accountsPayable -= t.amount_rub;

      if (creditAccount.code === 'LOANS') loans += t.amount_rub;
      if (debitAccount.code === 'LOANS') loans -= t.amount_rub;

      const equityAccount = getSystemAccount('equity');
      if (t.credit_account_id === equityAccount && t.record_type === 'fact') {
        capital += t.amount_rub;
      }
    }

    // ============================================
    // Основные средства — источник зависит от настройки
    // ============================================
    const fixedAssetsSource = this.resolveFixedAssetsSource(settings);

    const fixedAssetsFromTransactions = fixedAssets;
    const fixedAssetsFromRegistry = registryFixedAssets || 0;

    let finalFixedAssets: number;
    if (fixedAssetsSource === 'registry') {
      finalFixedAssets = fixedAssetsFromRegistry;
    } else if (fixedAssetsSource === 'auto') {
      finalFixedAssets = fixedAssetsFromRegistry > 0
        ? fixedAssetsFromRegistry
        : fixedAssetsFromTransactions;
    } else {
      finalFixedAssets = fixedAssetsFromTransactions;
    }

    fixedAssets = finalFixedAssets;

    // Налоговые обязательства
    let taxLiabilities = 0;
    if (company) {
      const taxCalc = taxEngine.calculateTax(company, transactions, accounts, '2000-01-01', date);
      taxLiabilities = taxCalc.income_tax_amount + taxCalc.insurance_amount + taxCalc.ndfl_amount + taxCalc.vat_to_pay;
    }

    const totalAssets = cash + accountsReceivable + inventory + fixedAssets;
    const totalLiabilities = accountsPayable + loans + taxLiabilities;
    const totalEquity = totalAssets - totalLiabilities;

    return {
      date,
      company_id: companyId,
      assets: {
        cash,
        accounts_receivable: accountsReceivable,
        inventory,
        fixed_assets: fixedAssets,
        total: totalAssets
      },
      liabilities: {
        accounts_payable: accountsPayable,
        loans,
        total: totalLiabilities
      },
      equity: {
        capital,
        retained_earnings: totalEquity - capital,
        total: totalEquity
      }
    };
  }

  /**
   * Async-обёртка для calculateBalanceSheet:
   * сначала рассчитывает ОС из справочника (если нужно),
   * потом вызывает sync-версию.
   */
  async calculateBalanceSheetAsync(
    transactions: Transaction[],
    accounts: Account[],
    companyId: string,
    date: string,
    company?: any,
    settings?: any[],
  ): Promise<BalanceSheet> {
    const fixedAssetsSource = this.resolveFixedAssetsSource(settings);

    let registryFixedAssets: number | undefined = undefined;
    if (fixedAssetsSource === 'registry' || fixedAssetsSource === 'auto') {
      registryFixedAssets = await this.calculateFixedAssetsFromRegistry(companyId, date);
    }

    return this.calculateBalanceSheet(
      transactions, accounts, companyId, date, company, settings, registryFixedAssets,
    );
  }

  /**
   * Вспомогательные функции
   */
  private calculateBalance(transactions: Transaction[], accounts: Account[]): number {
    let balance = 0;

    for (const t of transactions) {
      const debitAccount = accounts.find(a => a.id === t.debit_account_id);
      const creditAccount = accounts.find(a => a.id === t.credit_account_id);

      if (!debitAccount || !creditAccount) continue;

      const debitIsCash = Boolean(debitAccount.is_cash_flow);
      const creditIsCash = Boolean(creditAccount.is_cash_flow);

      if (debitIsCash) balance += t.amount_rub;
      if (creditIsCash) balance -= t.amount_rub;
    }

    return balance;
  }

  /**
   * Разбор настройки balance_fixed_assets_source.
   */
  private resolveFixedAssetsSource(settings?: any[]): 'transactions' | 'registry' | 'auto' {
    const settingsMap: Record<string, string> = {};
    if (settings) {
      for (const s of settings) settingsMap[s.key] = s.value;
    }
    const raw = settingsMap['balance_fixed_assets_source'] || 'transactions';
    if (raw === 'registry' || raw === 'auto') return raw;
    return 'transactions';
  }

  /**
   * Расчёт ОС из справочника FixedAsset.
   */
  private async calculateFixedAssetsFromRegistry(
    companyId: string,
    asOfDate: string,
  ): Promise<number> {
    try {
      const { prisma } = await import('@/lib/prisma');

      const assets = await prisma.fixedAsset.findMany({
        where: {
          company_id: companyId,
          is_deleted: { not: 'true' },
          commissioning_date: { lte: new Date(asOfDate + 'T23:59:59.999Z') },
        },
      });

      let total = 0;

      for (const asset of assets) {
        if (asset.disposal_date && new Date(asset.disposal_date) <= new Date(asOfDate)) {
          continue;
        }

        const initialCost = Number(asset.initial_cost || 0);
        const salvageValue = Number(asset.salvage_value || 0);
        const usefulLife = Number(asset.useful_life_months || 0);

        if (initialCost <= 0 || usefulLife <= 0) continue;

        const commissioningDate = new Date(asset.commissioning_date);
        const startYM = new Date(
          commissioningDate.getUTCFullYear(),
          commissioningDate.getUTCMonth() + 1,
          1,
        );

        const asOf = new Date(asOfDate);
        // Конец текущего месяца отчёта (амортизация начисляется за месяц)
        const endOfMonth = new Date(
          asOf.getUTCFullYear(),
          asOf.getUTCMonth() + 1,
          0,
        );

        if (endOfMonth < startYM) {
          // Амортизация ещё не началась
          total += initialCost;
          continue;
        }

        // Количество полных месяцев амортизации
        let monthsElapsed =
          (endOfMonth.getUTCFullYear() - startYM.getUTCFullYear()) * 12 +
          (endOfMonth.getUTCMonth() - startYM.getUTCMonth()) +
          1;

        monthsElapsed = Math.min(monthsElapsed, usefulLife);

        const monthlyAmount = (initialCost - salvageValue) / usefulLife;
        const accumulated = monthlyAmount * monthsElapsed;
        const residual = initialCost - accumulated;

        total += residual;
      }

      return total;
    } catch (e) {
      console.error('Ошибка calculateFixedAssetsFromRegistry:', e);
      return 0;
    }
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

export const calculator = new FinancialCalculator();
