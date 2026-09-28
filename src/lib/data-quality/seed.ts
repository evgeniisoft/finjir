/**
 * ============================================
 * Data Quality — Seed
 * Собирает все правила из категорий.
 * ============================================
 */

import { DataQualityRule } from './types';
import { SEED_CLASSIFICATION } from './seed-classification';
import { SEED_COMPLETENESS } from './seed-completeness';
import { SEED_FORMAT } from './seed-format';

export const SEED_RULES: Partial<DataQualityRule>[] = [
  ...SEED_CLASSIFICATION,
  ...SEED_COMPLETENESS,
  ...SEED_FORMAT,
];
