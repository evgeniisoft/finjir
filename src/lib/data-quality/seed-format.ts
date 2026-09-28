/**
 * ============================================
 * Data Quality — Seed: Формат и диапазон
 * ============================================
 */

import { DataQualityRule } from './types';

export const SEED_FORMAT: Partial<DataQualityRule>[] = [
  {
    name: 'Сумма больше нуля',
    description: 'Сумма каждой транзакции должна быть положительной',
    category: 'format',
    rule_type: 'range',
    entity_type: 'Transactions',
    target_field: 'amount_rub',
    params: { min: 0.01 },
    severity: 'warning',
    is_active: true,
    auto_apply: false,
  },
  {
    name: 'Сумма меньше 1 млрд',
    description: 'Сумма не должна превышать 1 млрд рублей',
    category: 'format',
    rule_type: 'range',
    entity_type: 'Transactions',
    target_field: 'amount_rub',
    params: { max: 1000000000 },
    severity: 'warning',
    is_active: true,
    auto_apply: false,
  },
  {
    name: 'Дата не в будущем для фактов',
    description: 'Транзакции с record_type=fact не должны иметь будущую дату',
    category: 'format',
    rule_type: 'range',
    entity_type: 'Transactions',
    target_field: 'date',
    condition: { record_type: 'fact' },
    params: { max: 'today' },
    severity: 'warning',
    is_active: true,
    auto_apply: false,
  },
  {
    name: 'Дата не в прошлом для планов',
    description: 'Транзакции с record_type=plan не должны быть в прошлом',
    category: 'format',
    rule_type: 'range',
    entity_type: 'Transactions',
    target_field: 'date',
    condition: { record_type: 'plan' },
    params: { min: 'today' },
    severity: 'info',
    is_active: false, // По умолчанию ВЫКЛЮЧЕНО — планы в прошлом иногда допустимы
    auto_apply: false,
  },
];
