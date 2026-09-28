/**
 * ============================================
 * FinEngine 2026 - Data Quality
 * Движок проверки правил
 * ============================================
 */

import {
  DataQualityRule,
  DataQualityException,
  Violation,
  SuggestedAction,
} from './types';
import {
  defaultProblemTemplate,
  defaultExplanationTemplate,
  defaultActionsForRule,
  suggestAccountForEntity,
} from './templates';

export interface DataQualityData {
  transactions: any[];
  accounts: any[];
  companies: any[];
  budgets: any[];
}

export class DataQualityEngine {
  /**
   * Применить правила к данным. Возвращает список нарушений.
   */
  run(
    rules: DataQualityRule[],
    data: DataQualityData,
    exceptions: DataQualityException[] = [],
  ): Violation[] {
    const violations: Violation[] = [];
    const exceptionSet = new Set(
      exceptions.map(e => `${e.rule_id}:${e.entity_type}:${e.entity_id}`),
    );

    for (const rule of rules) {
      if (!rule.is_active) continue;

      const entities = this.getEntities(data, rule.entity_type);
      for (const entity of entities) {
        if (!this.matchesCondition(rule, entity, data)) continue;

        const key = `${rule.id}:${rule.entity_type}:${entity.id}`;
        if (exceptionSet.has(key)) continue;

        const violation = this.applyRule(rule, entity, data);
        if (violation) violations.push(violation);
      }
    }

    return violations;
  }

  // ============================================
  // Условия
  // ============================================

  private getEntities(data: DataQualityData, entityType: string): any[] {
    switch (entityType) {
      case 'Transactions': return data.transactions;
      case 'Accounts': return data.accounts;
      case 'Companies': return data.companies;
      case 'Budgets': return data.budgets;
      default: return [];
    }
  }

  private matchesCondition(
    rule: DataQualityRule,
    entity: any,
    data: DataQualityData,
  ): boolean {
    const cond = rule.condition;
    if (!cond || Object.keys(cond).length === 0) return true;

    for (const [key, value] of Object.entries(cond)) {
      if (key.endsWith('_like')) {
        const field = key.replace(/_like$/, '');
        const pattern = String(value).replace(/%/g, '.*');
        const re = new RegExp(`^${pattern}$`);
        if (!re.test(String(entity[field] || ''))) return false;
      } else if (key.endsWith('_in')) {
        const field = key.replace(/_in$/, '');
        if (!Array.isArray(value)) return false;
        if (!value.includes(entity[field])) return false;
      } else {
        if (entity[key] !== value) return false;
      }
    }

    return true;
  }

  // ============================================
  // Применение правила
  // ============================================

  private applyRule(
    rule: DataQualityRule,
    entity: any,
    data: DataQualityData,
  ): Violation | null {
    const value = entity[rule.target_field];
    const strValue = value == null ? '' : String(value).toLowerCase();
    const params = rule.params || {};

    let isViolation = false;

    switch (rule.rule_type) {
      case 'must_contain': {
        const keywords: string[] = params.keywords || [];
        if (keywords.length === 0) return null;
        isViolation = !keywords.some(kw => strValue.includes(kw.toLowerCase()));
        break;
      }

      case 'must_not_contain': {
        const keywords: string[] = params.keywords || [];
        if (keywords.length === 0) return null;
        isViolation = keywords.some(kw => strValue.includes(kw.toLowerCase()));
        break;
      }

      case 'required_field': {
        isViolation = value == null || String(value).trim() === '';
        break;
      }

      case 'range': {
        // Проверяем: числовой диапазон или дата.
        // Если target_field содержит 'date' — работаем как с датами.
        if (rule.target_field.includes('date')) {
          const valDate = new Date(String(value)).getTime();
          let minDate = params.min;
          let maxDate = params.max;

          if (minDate === 'today') minDate = new Date().toISOString().split('T')[0];
          if (maxDate === 'today') maxDate = new Date().toISOString().split('T')[0];

          const minTime = minDate ? new Date(String(minDate)).getTime() : -Infinity;
          const maxTime = maxDate ? new Date(String(maxDate)).getTime() : Infinity;

          isViolation = isNaN(valDate) || valDate < minTime || valDate > maxTime;
        } else {
          const num = parseFloat(String(value));
          const min = params.min ?? -Infinity;
          const max = params.max ?? Infinity;
          isViolation = isNaN(num) || num < min || num > max;
        }
        break;
      }

      case 'enum': {
        const values: any[] = params.values || [];
        if (values.length === 0) return null;
        isViolation = !values.includes(value);
        break;
      }

      case 'regex': {
        const pattern = params.pattern;
        if (!pattern) return null;
        try {
          const re = new RegExp(pattern);
          isViolation = !re.test(String(value ?? ''));
        } catch {
          return null;
        }
        break;
      }

      default:
        return null;
    }

    if (!isViolation) return null;

    return this.buildViolation(rule, entity, data);
  }

  private buildViolation(
    rule: DataQualityRule,
    entity: any,
    data: DataQualityData,
  ): Violation {
    const problemTemplate = rule.problem_template || defaultProblemTemplate(rule);
    const explanationTemplate = rule.explanation_template || defaultExplanationTemplate(rule);
    // ВСЕГДА пересчитываем действия на лету — чтобы fuzzy match был актуальным.
    // Передаём entity, чтобы для must_not_contain использовать матч по description,
    // а не по keywords правила.
    const actions = defaultActionsForRule(rule, data, entity);

    return {
      rule_id: rule.id,
      rule_name: rule.name,
      rule_type: rule.rule_type,
      severity: rule.severity,
      entity_type: rule.entity_type,
      entity_id: entity.id,
      entity,
      problem: this.renderTemplate(problemTemplate, entity, data),
      explanation: this.renderTemplate(explanationTemplate, entity, data),
      suggested_actions: actions,
    };
  }

  // ============================================
  // Шаблоны
  // ============================================

  private renderTemplate(template: string, entity: any, data: DataQualityData): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      if (key === 'account_name') {
        const acc = data.accounts.find(
          a => a.id === entity.debit_account_id || a.id === entity.credit_account_id,
        );
        return acc?.name || '—';
      }
      if (key === 'suggested_account') {
        const acc = suggestAccountForEntity(entity, data.accounts);
        return acc?.name || '—';
      }
      const val = entity[key];
      if (val == null) return '—';
      if (typeof val === 'number') return val.toLocaleString('ru-RU');
      return String(val);
    });
  }

  
}

export const dataQualityEngine = new DataQualityEngine();
