/**
 * ============================================
 * Data Quality — Seed: Бизнес-правила
 * ============================================
 */

import { DataQualityRule } from './types';

export const SEED_BUSINESS: Partial<DataQualityRule>[] = [
  {
    name: 'Не должно быть неклассифицированных операций',
    description: 'Операции на счёте «Требует уточнения» должны быть классифицированы',
    category: 'business_rules',
    rule_type: 'must_not_contain',
    entity_type: 'Transactions',
    target_field: 'description',
    condition: { debit_account_id: 'acc-unclassified' },
    params: { keywords: [''] }, // Пустое keywords = любое значение = нарушение
    severity: 'info',
    is_active: true,
    auto_apply: false,
  },
];
