/**
 * ============================================
 * FinEngine 2026 - Консолидация холдинга
 * ============================================
 * Объединение отчётов нескольких компаний
 * с исключением внутригрупповых оборотов (ВГО).
 */

import {
  Company,
  Transaction,
  CashFlowReport,
  PnLReport,
  BalanceSheet,
  Counterparty
} from './types';
import { calculator } from './calculator';
import { Account } from './types';

export class ConsolidationEngine {

  /**
   * Консолидация ДДС по холдингу
   */
  consolidateCashFlow(
    companies: Company[],
    transactions: Transaction[],
    accounts: Account[],
    periodStart: string,
    periodEnd: string
  ): CashFlowReport {

    // Фильтруем внутригрупповые операции
    const externalTransactions = this.excludeIntercompany(
      transactions,
      companies
    );

    // Суммируем по всем компаниям
    let consolidated: CashFlowReport = {
      period_start: periodStart,
      period_end: periodEnd,
      company_id: 'HOLDING',
      starting_balance: 0,
      operating_inflow: 0,
      operating_outflow: 0,
      investing_inflow: 0,
      investing_outflow: 0,
      financing_inflow: 0,
      financing_outflow: 0,
      tax_outflow: 0,
      ending_balance: 0
    };

    for (const company of companies) {
      const report = calculator.calculateCashFlow(
        externalTransactions,
        accounts,
        company.id,
        periodStart,
        periodEnd,
        company  // ← передаём company
      );

      consolidated.starting_balance += report.starting_balance;
      consolidated.operating_inflow += report.operating_inflow;
      consolidated.operating_outflow += report.operating_outflow;
      consolidated.investing_inflow += report.investing_inflow;
      consolidated.investing_outflow += report.investing_outflow;
      consolidated.financing_inflow += report.financing_inflow;
      consolidated.financing_outflow += report.financing_outflow;
      consolidated.tax_outflow += report.tax_outflow || 0;
      consolidated.ending_balance += report.ending_balance;
    }

    return consolidated;
  }

  /**
   * Консолидация ОПиУ по холдингу
   */
  consolidatePnL(
    companies: Company[],
    transactions: Transaction[],
    accounts: Account[],
    periodStart: string,
    periodEnd: string
  ): PnLReport {

    const externalTransactions = this.excludeIntercompany(
      transactions,
      companies
    );

    let consolidated: PnLReport = {
      period_start: periodStart,
      period_end: periodEnd,
      company_id: 'HOLDING',
      revenue: 0,
      cost_of_goods_sold: 0,
      gross_profit: 0,
      operating_expenses: 0,
      insurance_amount: 0,
      ndfl_amount: 0,
      depreciation: 0,
      taxes: 0,
      net_profit: 0
    };
    for (const company of companies) {
      const report = calculator.calculatePnL(
        externalTransactions,
        accounts,
        company.id,
        periodStart,
        periodEnd,
        company  // ← передаём company
      );

      consolidated.revenue += report.revenue;
      consolidated.cost_of_goods_sold += report.cost_of_goods_sold;
      consolidated.gross_profit += report.gross_profit;
      consolidated.operating_expenses += report.operating_expenses;
      consolidated.insurance_amount += report.insurance_amount || 0;
      consolidated.ndfl_amount += report.ndfl_amount || 0;
      consolidated.depreciation += report.depreciation;
      consolidated.taxes += report.taxes;
      consolidated.net_profit += report.net_profit;
    }

    return consolidated;
  }

  /**
   * Консолидация Баланса по холдингу
   */
  consolidateBalanceSheet(
    companies: Company[],
    transactions: Transaction[],
    accounts: Account[],
    date: string
  ): BalanceSheet {

    const externalTransactions = this.excludeIntercompany(
      transactions,
      companies
    );

    let consolidated: BalanceSheet = {
      date,
      company_id: 'HOLDING',
      assets: {
        cash: 0,
        accounts_receivable: 0,
        inventory: 0,
        fixed_assets: 0,
        total: 0
      },
      liabilities: {
        accounts_payable: 0,
        loans: 0,
        total: 0
      },
      equity: {
        capital: 0,
        retained_earnings: 0,
        total: 0
      }
    };

    for (const company of companies) {
      const report = calculator.calculateBalanceSheet(
        externalTransactions,
        accounts,
        company.id,
        date,
        company
      );
      
      consolidated.assets.cash += report.assets.cash;
      consolidated.assets.accounts_receivable += report.assets.accounts_receivable;
      consolidated.assets.inventory += report.assets.inventory;
      consolidated.assets.fixed_assets += report.assets.fixed_assets;
      consolidated.assets.total += report.assets.total;

      consolidated.liabilities.accounts_payable += report.liabilities.accounts_payable;
      consolidated.liabilities.loans += report.liabilities.loans;
      consolidated.liabilities.total += report.liabilities.total;

      consolidated.equity.capital += report.equity.capital;
      consolidated.equity.retained_earnings += report.equity.retained_earnings;
      consolidated.equity.total += report.equity.total;
    }

    return consolidated;
  }

    /**
   * Исключение внутригрупповых операций
   *
   * ВНИМАНИЕ: полная логика ВГО не реализована — нет данных
   * для определения «внутригрупповой» операции. Сейчас
   * фильтр `!t.is_system` фактически ничего не исключает
   * (все транзакции имеют is_system=null/false).
   *
   * Следствие: consolidatePnL = sum(calculatePnL).
   * Проверки диагностики 4.4-4.8 фактически тавтологичны.
   *
   * TODO: реализовать ВГО (нужны: counterparty → company mapping,
   *       либо отдельный флаг intercompany).
   */
  private excludeIntercompany(
    transactions: Transaction[],
    companies: Company[]
  ): Transaction[] {
    return transactions.filter(t => !t.is_system);
  }
}

export const consolidationEngine = new ConsolidationEngine();
