/**
 * ============================================
 * FinEngine 2026 - Data Quality
 * Preview последствий действий (dry-run)
 * ============================================
 */

import { calculator } from '@/lib/engine/calculator';
import { PreviewResult, SuggestedAction } from './types';

export interface PreviewContext {
  entity: any;
  action: SuggestedAction;
  userInput?: any;
  allData: {
    transactions: any[];
    accounts: any[];
    companies: any[];
    budgets: any[];
  };
  periodStart: string;
  periodEnd: string;
}

/**
 * Прогнать действие на копии данных и посчитать diff.
 */
export async function previewAction(ctx: PreviewContext): Promise<PreviewResult> {
  try {
    const { entity, action, allData, periodStart, periodEnd } = ctx;

    // Копируем транзакции
    const previewTx = allData.transactions.map(t => ({ ...t }));

    // Применяем действие к копии
    const applied = applyActionToCopy(action, entity, previewTx, ctx.userInput);
    if (!applied) {
      return { success: false, error: 'Действие не может быть симулировано' };
    }

    const company = allData.companies.find(c => c.id === entity.company_id);
    if (!company) {
      return { success: false, error: 'Компания не найдена' };
    }

    // Считаем до
    const beforePnL = calculator.calculatePnL(
      allData.transactions, allData.accounts, entity.company_id,
      periodStart, periodEnd, company,
    );
    const beforeCF = calculator.calculateCashFlow(
      allData.transactions, allData.accounts, entity.company_id,
      periodStart, periodEnd, company,
    );
    const beforeBS = calculator.calculateBalanceSheet(
      allData.transactions, allData.accounts, entity.company_id,
      periodEnd, company,
    );

    // Считаем после
    const afterPnL = calculator.calculatePnL(
      previewTx, allData.accounts, entity.company_id,
      periodStart, periodEnd, company,
    );
    const afterCF = calculator.calculateCashFlow(
      previewTx, allData.accounts, entity.company_id,
      periodStart, periodEnd, company,
    );
    const afterBS = calculator.calculateBalanceSheet(
      previewTx, allData.accounts, entity.company_id,
      periodEnd, company,
    );

    // Diff
    const pnl_diff = {
      revenue: afterPnL.revenue - beforePnL.revenue,
      cogs: afterPnL.cost_of_goods_sold - beforePnL.cost_of_goods_sold,
      opex: afterPnL.operating_expenses - beforePnL.operating_expenses,
      taxes: afterPnL.taxes - beforePnL.taxes,
      net_profit: afterPnL.net_profit - beforePnL.net_profit,
    };

    const cashflow_diff = {
      operating: (afterCF.operating_inflow - afterCF.operating_outflow)
              - (beforeCF.operating_inflow - beforeCF.operating_outflow),
      investing: (afterCF.investing_inflow - afterCF.investing_outflow)
              - (beforeCF.investing_inflow - beforeCF.investing_outflow),
      financing: (afterCF.financing_inflow - afterCF.financing_outflow)
              - (beforeCF.financing_inflow - beforeCF.financing_outflow),
      ending_balance: afterCF.ending_balance - beforeCF.ending_balance,
    };

    const balance_diff = {
      assets: afterBS.assets.total - beforeBS.assets.total,
      liabilities: afterBS.liabilities.total - beforeBS.liabilities.total,
      equity: afterBS.equity.total - beforeBS.equity.total,
    };

    // Пострадавшие счета
    const affected_accounts = computeAffectedAccounts(
      entity, action, allData.accounts, ctx.userInput,
    );

    return {
      success: true,
      pnl_diff,
      cashflow_diff,
      balance_diff,
      affected_accounts,
      notes: [],
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Применяет действие к копии массива транзакций (in-place).
 * Возвращает true, если действие применимо.
 */
function applyActionToCopy(
  action: SuggestedAction,
  entity: any,
  txCopy: any[],
  userInput?: any,
): boolean {
  const idx = txCopy.findIndex(t => t.id === entity.id);
  if (idx === -1) return false;

  switch (action.type) {
    case 'reassign_account': {
      const field = action.config.field === 'credit' ? 'credit_account_id' : 'debit_account_id';
      txCopy[idx] = { ...txCopy[idx], [field]: action.config.new_account_id };
      return true;
    }
    case 'edit_field': {
      const field = action.config.field;
      const newValue = userInput?.value;
      txCopy[idx] = { ...txCopy[idx], [field]: newValue };
      return true;
    }
    case 'delete_entity': {
      txCopy.splice(idx, 1);
      return true;
    }
    case 'create_exception': {
      // Не влияет на отчёты — diff нулевой.
      return true;
    }
    default:
      return false;
  }
}

function computeAffectedAccounts(
  entity: any,
  action: SuggestedAction,
  accounts: any[],
  userInput?: any,
): Array<{ account_id: string; account_name: string; delta: number }> {
  const result: Array<{ account_id: string; account_name: string; delta: number }> = [];
  const amount = Math.abs(Number(entity.amount_rub || entity.amount || 0));

  if (action.type === 'reassign_account') {
    const oldId = entity.debit_account_id;
    const newId = action.config.new_account_id;
    const oldAcc = accounts.find(a => a.id === oldId);
    const newAcc = accounts.find(a => a.id === newId);
    if (oldAcc) result.push({ account_id: oldId, account_name: oldAcc.name, delta: -amount });
    if (newAcc) result.push({ account_id: newId, account_name: newAcc.name, delta: +amount });
  } else if (action.type === 'delete_entity') {
    const accId = entity.debit_account_id || entity.credit_account_id;
    const acc = accounts.find(a => a.id === accId);
    if (acc) result.push({ account_id: accId, account_name: acc.name, delta: -amount });
  }

  return result;
}
