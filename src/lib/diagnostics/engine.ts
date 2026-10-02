/**
 * ============================================
 * FinEngine 2026 - Движок диагностики
 * ============================================
 */

import {
  DiagnosticContext,
  DiagnosticCheck,
  DiagnosticsResult,
  DiagnosticsSummary,
  DiagnosticsByCategory,
  DiagnosticsByLevel,
  DiagnosticCategory,
  DiagnosticLevel,
  DiagnosticSeverity,
} from './types';

import { runDataIntegrityChecks } from './checks/data-integrity';
import { runSettingsChecks } from './checks/settings';
import { runCalculationChecks } from './checks/calculations';
import { runConsistencyChecks } from './checks/consistency';
import { runBusinessRuleChecks } from './checks/business-rules';
import { runFixedAssetChecks } from './checks/fixed-assets';
import { runInfrastructureChecks } from './checks/infrastructure';
import { runProcessChecks } from './checks/processes';

export class DiagnosticsEngine {

  async run(context: DiagnosticContext): Promise<DiagnosticsResult> {
    const checks: DiagnosticCheck[] = [];

    // Уровень 1: Целостность данных
    if (context.options.checkInfrastructure !== false) {
      checks.push(...await runDataIntegrityChecks(context));
    }

    // Уровень 2: Настройки
    checks.push(...await runSettingsChecks(context));

    // Уровень 3: Формулы
    checks.push(...await runCalculationChecks(context));

    // Уровень 4: Согласованность
    if (context.options.checkConsistency) {
      checks.push(...await runConsistencyChecks(context));
    }

    // Уровень 5: Бизнес-правила
    if (context.options.checkBusinessRules) {
      checks.push(...await runBusinessRuleChecks(context));
    }

    // Уровень 5: Сверка основных средств
    if (context.options.checkBusinessRules) {
      checks.push(...await runFixedAssetChecks(context));
    }

    // Уровень 6: Инфраструктура
    if (context.options.checkInfrastructure) {
      checks.push(...await runInfrastructureChecks(context));
    }

    // Уровень 7: Процессы
    checks.push(...await runProcessChecks(context));

    return {
      timestamp: new Date().toISOString(),
      execution_time: Date.now() - context.startTime,
      summary: this.summarize(checks),
      by_category: this.groupByCategory(checks),
      by_level: this.groupByLevel(checks),
      context: {
        period_start: context.periodStart,
        period_end: context.periodEnd,
        companies_count: context.companies.length,
        transactions_count: context.transactions.length,
        gas_load_time: context.gasLoadTime,
      },
      checks,
    };
  }

  private summarize(checks: DiagnosticCheck[]): DiagnosticsSummary {
    const critical = checks.filter(c => c.severity === 'critical').length;
    const warnings = checks.filter(c => c.severity === 'warning').length;
    const info = checks.filter(c => c.severity === 'info').length;
    const ok = checks.filter(c => c.severity === 'ok').length;

    const total = checks.length;
    const healthScore = total > 0
      ? Math.round(((ok + info * 0.7 + warnings * 0.3) / total) * 100)
      : 100;

    return { total_checks: total, critical, warnings, ok, info, health_score: healthScore };
  }

  private groupByCategory(checks: DiagnosticCheck[]): DiagnosticsByCategory {
    const result: DiagnosticsByCategory = {};
    for (const c of checks) {
      if (!result[c.category]) {
        result[c.category] = { total: 0, critical: 0, warning: 0, ok: 0, info: 0 };
      }
      result[c.category].total++;
      if (c.severity === 'critical') result[c.category].critical++;
      else if (c.severity === 'warning') result[c.category].warning++;
      else if (c.severity === 'info') result[c.category].info++;
      else result[c.category].ok++;
    }
    return result;
  }

  private groupByLevel(checks: DiagnosticCheck[]): DiagnosticsByLevel {
    const result: DiagnosticsByLevel = {};
    for (const c of checks) {
      const key = String(c.level);
      if (!result[key]) {
        result[key] = { total: 0, critical: 0, warning: 0 };
      }
      result[key].total++;
      if (c.severity === 'critical') result[key].critical++;
      else if (c.severity === 'warning') result[key].warning++;
    }
    return result;
  }
}

export const diagnosticsEngine = new DiagnosticsEngine();

/**
 * Хелпер: создать проверку "OK"
 */
export function okCheck(
  id: string,
  level: DiagnosticLevel,
  category: DiagnosticCategory,
  name: string,
  message: string,
  details?: any
): DiagnosticCheck {
  return {
    id,
    level,
    category,
    severity: 'ok',
    name,
    message,
    details,
    recommendation: null,
  };
}

/**
 * Хелпер: создать проверку с проблемой
 */
export function problemCheck(
  id: string,
  level: DiagnosticLevel,
  category: DiagnosticCategory,
  severity: DiagnosticSeverity,
  name: string,
  message: string,
  options?: Partial<DiagnosticCheck>
): DiagnosticCheck {
  return {
    id,
    level,
    category,
    severity,
    name,
    message,
    recommendation: null,
    ...options,
  };
}
