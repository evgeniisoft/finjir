/**
 * ============================================
 * FinEngine 2026 - Единый фильтр статей отчётов
 * ============================================
 * Единый источник правды для классификации счетов:
 * - OPEX (операционные расходы) — для calculatePnL, taxEngine, monthly
 * - Revenue (выручка операционная)
 * - COGS (себестоимость)
 *
 * Используется в:
 * - calculator.calculatePnL
 * - taxEngine.calculateTax
 * - monthlyEngine.getPeriodBreakdown
 *
 * Правило: счёт — OPEX, если он X-типа, operating, и не входит
 * в явные исключения (налоги, амортизация, capex, кредиты, дивиденды).
 */

import { Account } from './types';

/**
 * Операционный расход (OPEX).
 * X-тип, operating activity, не исключён явно.
 */
export function isOpexAccount(account: Account): boolean {
  if (!account || account.type !== 'X') return false;
  if (account.activity_type !== 'operating') return false;
  if (account.id.startsWith('acc-tax-')) return false;
  if (account.id.startsWith('acc-depreciation-')) return false;
  if (account.id === 'acc-out-capex') return false;
  if (account.id.startsWith('acc-out-loan-')) return false;
  if (account.id === 'acc-out-dividends') return false;
  return true;
}

/**
 * Операционная выручка.
 * I-тип, operating activity, не инвестиционная, не кредит.
 */
export function isRevenueAccount(account: Account): boolean {
  if (!account || account.type !== 'I') return false;
  if (account.activity_type !== 'operating') return false;
  if (account.id.startsWith('acc-in-invest-')) return false;
  if (account.id === 'acc-in-loan') return false;
  return true;
}

/**
 * Себестоимость.
 * X-тип с флагом is_cost_of_goods.
 */
export function isCogsAccount(account: Account): boolean {
  if (!account || account.type !== 'X') return false;
  return Boolean(account.is_cost_of_goods);
}
