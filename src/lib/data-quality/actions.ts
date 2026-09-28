/**
 * ============================================
 * FinEngine 2026 - Data Quality
 * Применение действий
 * ============================================
 */

import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';
import { NextRequest } from 'next/server';
import { SuggestedAction } from './types';

export interface ApplyContext {
  entity: any;
  action: SuggestedAction;
  userInput?: any;
  ruleId?: string;
  userId?: string;
}

export interface ApplyResult {
  success: boolean;
  error?: string;
  log?: {
    action_type: string;
    entity_type: string;
    entity_id: string;
    before_value: string;
    after_value: string;
  };
}

/**
 * Применить действие к одному объекту.
 */
export async function applyAction(ctx: ApplyContext): Promise<ApplyResult> {
  const repo = getRepository();
  const { entity, action, userInput, ruleId, userId } = ctx;

  const beforeValue = JSON.stringify({
    description: entity.description,
    debit_account_id: entity.debit_account_id,
    credit_account_id: entity.credit_account_id,
    amount_rub: entity.amount_rub,
  });

  try {
    switch (action.type) {
      case 'reassign_account': {
        const field = action.config.field === 'credit' ? 'credit_account_id' : 'debit_account_id';
        await repo.update('Transactions', entity.id, {
          [field]: action.config.new_account_id,
        });
        const afterValue = JSON.stringify({
          description: entity.description,
          debit_account_id: field === 'debit_account_id' ? action.config.new_account_id : entity.debit_account_id,
          credit_account_id: field === 'credit_account_id' ? action.config.new_account_id : entity.credit_account_id,
          amount_rub: entity.amount_rub,
        });
        return logResult(ruleId, action.type, 'Transactions', entity.id, beforeValue, afterValue, userId);
      }

      case 'edit_field': {
        const field = action.config.field;
        const newValue = userInput?.value;
        if (newValue === undefined) {
          return { success: false, error: 'Не задано новое значение' };
        }
        await repo.update('Transactions', entity.id, { [field]: newValue });
        const afterValue = JSON.stringify({
          ...JSON.parse(beforeValue),
          [field]: newValue,
        });
        return logResult(ruleId, action.type, 'Transactions', entity.id, beforeValue, afterValue, userId);
      }

      case 'delete_entity': {
        await repo.delete('Transactions', entity.id);
        return logResult(ruleId, action.type, 'Transactions', entity.id, beforeValue, '{}', userId);
      }

      case 'create_exception': {
        const now = new Date().toISOString();
        await repo.create('DataQualityExceptions', {
          tenant_id: 'tenant-1',
          rule_id: ruleId || '',
          entity_type: 'Transactions',
          entity_id: entity.id,
          reason: userInput?.reason || null,
          created_by: userId || null,
          created_at: now,
        });
        return logResult(ruleId, action.type, 'Transactions', entity.id, beforeValue, beforeValue, userId);
      }

      default:
        return { success: false, error: `Действие «${action.type}» не поддерживается` };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function logResult(
  ruleId: string | undefined,
  actionType: string,
  entityType: string,
  entityId: string,
  beforeValue: string,
  afterValue: string,
  userId: string | undefined,
): Promise<ApplyResult> {
  const repo = getRepository();
  try {
    await repo.create('DataQualityActionLogs', {
      tenant_id: 'tenant-1',
      rule_id: ruleId || null,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      before_value: beforeValue,
      after_value: afterValue,
      user_id: userId || null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // Лог не критичен — не падаем.
    console.warn('data-quality: не удалось записать лог', e);
  }

  return {
    success: true,
    log: {
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      before_value: beforeValue,
      after_value: afterValue,
    },
  };
}
