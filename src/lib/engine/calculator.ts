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
        if (debitAccount.type === 'X' && !debitAccount.id.startsWith('acc-tax-')) {
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

    // Налоговые выбытия из taxEngine
    let taxOutflow = 0;
    if (company) {
      const taxCalc = taxEngine.calculateTax(company, transactions, accounts, periodStart, periodEnd);
      taxOutflow = taxCalc.income_tax_amount + taxCalc.insurance_amount + taxCalc.ndfl_amount + taxCalc.vat_to_pay;
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

    // Получаем расчёт налогов (для корректной выручки без НДС)
    const taxCalc = taxEngine.calculateTax(company, transactions, accounts, periodStart, periodEnd);

    // Выручка без НДС из налогового расчёта
    const revenue = taxCalc.revenue_without_vat;

    // Классифицируем расходы
    // Определяем, включает ли компания НДС
    const vatIncluded = String(company?.vat_included).toLowerCase() === 'true';
    const vatRate = parseFloat(String(company?.vat_rate || '0'));

    // Классифицируем расходы (с выделением НДС для ОСНО)
    for (const t of filtered) {
      const debitAccount = accounts.find(a => a.id === t.debit_account_id);
      const creditAccount = accounts.find(a => a.id === t.credit_account_id);

      if (!debitAccount || !creditAccount) continue;

      if (debitAccount.type === 'X') {
        const category = debitAccount.code;
        const isCOGS = Boolean(debitAccount.is_cost_of_goods);

        // Выделяем НДС из расходов для ОСНО
        let expenseAmount = t.amount_rub || 0;
        if (vatIncluded && vatRate > 0) {
          expenseAmount = expenseAmount / (1 + vatRate);
        }

        if (isCOGS || category === 'COGS') {
          costOfGoodsSold += expenseAmount;
        } else if (category === 'DEPRECIATION') {
          depreciation += expenseAmount;
        } else if (category === 'TAXES') {
          taxes += expenseAmount;
        } else {
          operatingExpenses += expenseAmount;
        }
      }
    }

    // Налоги из taxEngine (только налог на прибыль/УСН, без взносов)
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
   * Расчёт Баланса
   */
  calculateBalanceSheet(
    transactions: Transaction[],
    accounts: Account[],
    companyId: string,
    date: string,
    company?: any
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
    let retainedEarnings = 0;

    // Проходим по всем операциям один раз
    for (const t of filtered) {
      const debitAccount = accounts.find(a => a.id === t.debit_account_id);
      const creditAccount = accounts.find(a => a.id === t.credit_account_id);

      if (!debitAccount || !creditAccount) continue;

      // Денежные счета
      const debitIsCash = Boolean(debitAccount.is_cash_flow);
      const creditIsCash = Boolean(creditAccount.is_cash_flow);

      if (debitIsCash) cash += t.amount_rub;
      if (creditIsCash) cash -= t.amount_rub;

      // Дебиторская задолженность (счёт acc-ar-001)
      const arAccount = getSystemAccount('ar');
      if (t.debit_account_id === arAccount) accountsReceivable += t.amount_rub;
      if (t.credit_account_id === arAccount) accountsReceivable -= t.amount_rub;

      // Запасы
      if (debitAccount.code === 'INVENTORY') inventory += t.amount_rub;
      if (creditAccount.code === 'INVENTORY') inventory -= t.amount_rub;
      // Основные средства
      const fixedAssetsAccount = getSystemAccount('fixed_assets');
      if (debitAccount.code === 'FIXED_ASSETS' || debitAccount.id === fixedAssetsAccount) {
        fixedAssets += t.amount_rub;
      }
      if (creditAccount.code === 'FIXED_ASSETS' || creditAccount.id === fixedAssetsAccount) {
        fixedAssets -= t.amount_rub;
      }

      // Кредиторская задолженность (счёт acc-ap-001)
      const apAccount = getSystemAccount('ap');
      if (t.credit_account_id === apAccount) accountsPayable += t.amount_rub;
      if (t.debit_account_id === apAccount) accountsPayable -= t.amount_rub;

      // Кредиты
      if (creditAccount.code === 'LOANS') loans += t.amount_rub;
      if (debitAccount.code === 'LOANS') loans -= t.amount_rub;

      // Капитал (начальные остатки)
      const equityAccount = getSystemAccount('equity');
      if (t.credit_account_id === equityAccount && t.record_type === 'fact') {
        capital += t.amount_rub;
      }
    }

    // Рассчитываем налоги за период
    let taxLiabilities = 0;
    if (company) {
      const taxCalc = taxEngine.calculateTax(company, transactions, accounts, '2000-01-01', date);
      taxLiabilities = taxCalc.income_tax_amount + taxCalc.insurance_amount + taxCalc.ndfl_amount + taxCalc.vat_to_pay;
    }

    const totalAssets = cash + accountsReceivable + inventory + fixedAssets;

    const totalLiabilities = accountsPayable + loans + taxLiabilities;
    // Капитал = Активы - Пассивы
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

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Экспорт singleton
export const calculator = new FinancialCalculator();
