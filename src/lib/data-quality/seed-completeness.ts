/**
 * ============================================
 * Data Quality — Seed: Полнота данных
 * ============================================
 */

import { DataQualityRule } from './types';

export const SEED_COMPLETENESS: Partial<DataQualityRule>[] = [
  {
    name: 'Описание обязательно для операционных расходов',
    description: 'Все операционные расходы (acc-out-*) должны иметь описание',
    category: 'completeness',
    rule_type: 'required_field',
    entity_type: 'Transactions',
    target_field: 'description',
    condition: { debit_account_id_like: 'acc-out-%' },
    severity: 'info',
    is_active: true,
    auto_apply: false,
  },
  {
    name: 'Описание обязательно для доходов',
    description: 'Все доходы (acc-in-*) должны иметь описание',
    category: 'completeness',
    rule_type: 'required_field',
    entity_type: 'Transactions',
    target_field: 'description',
    condition: { credit_account_id_like: 'acc-in-%' },
    severity: 'info',
    is_active: true,
    auto_apply: false,
  },
  {
    name: 'Контрагент обязателен для операционных расходов',
    description: 'Операционные расходы (acc-out-*) должны иметь контрагента',
    category: 'completeness',
    rule_type: 'required_field',
    entity_type: 'Transactions',
    target_field: 'counterparty_id',
    condition: { debit_account_id_like: 'acc-out-%' },
    severity: 'info',
    is_active: true,
    auto_apply: false,
  },
];
