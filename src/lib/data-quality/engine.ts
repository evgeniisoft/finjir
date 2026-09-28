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
  suggestAccountByKeywords,
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
        const num = parseFloat(String(value));
        const min = params.min ?? -Infinity;
        const max = params.max ?? Infinity;
        isViolation = isNaN(num) || num < min || num > max;
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
    const actions = rule.suggested_actions && rule.suggested_actions.length > 0
      ? rule.suggested_actions
      : defaultActionsForRule(rule, data);

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
        // Пробуем найти подходящий счёт по keywords правила.
        // В template мы не имеем rule, поэтому используем общий fuzzy-match.
        const acc = this.suggestAccountForEntity(entity, data);
        return acc?.name || '—';
      }
      const val = entity[key];
      if (val == null) return '—';
      if (typeof val === 'number') return val.toLocaleString('ru-RU');
      return String(val);
    });
  }

  private suggestAccountForEntity(entity: any, data: DataQualityData): any | null {
    const desc = String(entity.description || '').toLowerCase().trim();
    if (!desc) return null;

    const currentAccountId = entity.debit_account_id || entity.credit_account_id;
    const descWords = desc.split(/\s+/).filter(w => w.length >= 4);
    if (descWords.length === 0) return null;

    let best: { account: any; score: number; nameLen: number } | null = null;

    for (const acc of data.accounts) {
      if (acc.type !== 'X') continue;
      if (acc.id === currentAccountId) continue;

      const accName = String(acc.name || '').toLowerCase().trim();
      if (!accName) continue;

      const accWords = accName.split(/\s+/).filter(w => w.length >= 4);
      if (accWords.length === 0) continue;

      let score = 0;
      for (const accWord of accWords) {
        if (descWords.includes(accWord)) {
          score += 2;
          continue;
        }
        const stem = accWord.length > 5 ? accWord.slice(0, accWord.length - 2) : accWord;
        if (descWords.some(dw => dw.includes(stem) || stem.includes(dw))) {
          score += 1;
        }
      }

      if (score > 0) {
        const nameLen = accName.length;
        if (!best || score > best.score || (score === best.score && nameLen < best.nameLen)) {
          best = { account: acc, score, nameLen };
        }
      }
    }

    return best?.account || null;
  }
}

export const dataQualityEngine = new DataQualityEngine();
