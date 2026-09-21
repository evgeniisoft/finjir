import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { getSessionUser } from '@/lib/auth-server';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 });
    }
    if (!['owner', 'admin'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Нет прав' }, { status: 403 });
    }

    const repo = getRepository();
    const body = await request.json();
    const { check_id, action, data } = body;
    const userEmail = user.email || 'system';

    if (!action) {
      return NextResponse.json({ success: false, error: 'Не указано действие' }, { status: 400 });
    }

    switch (action) {

      // ========== Удаление дубликатов (по id, не по hash) ==========
      case 'delete_duplicates': {
        const ids = data || [];
        let deleted = 0;
        const errors: string[] = [];

        for (const id of ids) {
          try {
            const success = await repo.delete('Transactions', id);
            if (success) deleted++;
          } catch (e: any) {
            errors.push(`${id}: ${e.message}`);
          }
        }

        // Аудит
        await logAudit(repo, userEmail, 'delete_duplicates', 'Transactions', '', {
          deleted,
          errors: errors.slice(0, 10),
        });

        return NextResponse.json({
          success: true,
          message: `Удалено ${deleted} дубликатов${errors.length > 0 ? `, ошибок: ${errors.length}` : ''}`,
          deleted,
          errors: errors.slice(0, 10),
        });
      }

      // ========== Создание недостающих счетов ==========
      case 'create_missing_account': {
        const missingAccounts = data || [];
        const existingAccounts = await repo.getAll('Accounts');
        let created = 0;
        const errors: string[] = [];

        for (const accId of missingAccounts) {
          if (existingAccounts.some((a: any) => a.id === accId)) continue;

          let type = 'A';
          let name = 'Счёт';
          let activity_type = '';

          if (accId.startsWith('acc-in-')) {
            type = 'I';
            name = 'Доход';
            activity_type = 'operating';
          } else if (accId.startsWith('acc-out-rent')) {
            type = 'X';
            name = 'Аренда';
            activity_type = 'operating';
          } else if (accId.startsWith('acc-out-capex')) {
            type = 'X';
            name = 'CAPEX';
            activity_type = 'investing';
          } else if (accId.startsWith('acc-out-loan') || accId === 'acc-out-dividends') {
            type = 'X';
            name = 'Финансовый расход';
            activity_type = 'financing';
          } else if (accId.startsWith('acc-out-')) {
            type = 'X';
            name = 'Расход';
            activity_type = 'operating';
          } else if (accId.startsWith('acc-bank-') || accId.startsWith('acc-cash-')) {
            type = 'A';
            name = 'Денежный счёт';
          } else if (accId.startsWith('acc-tax-')) {
            type = 'X';
            name = 'Налог';
            activity_type = 'operating';
          }

          const newAccount = {
            id: accId,
            code: accId.replace('acc-', '').toUpperCase(),
            name,
            type,
            activity_type,
            is_cash_flow: accId.startsWith('acc-bank-') || accId.startsWith('acc-cash-'),
            is_cost_of_goods: false,
            parent_id: '',
          };

          try {
            await repo.create('Accounts', newAccount);
            created++;
          } catch (e: any) {
            errors.push(`${accId}: ${e.message}`);
          }
        }

        await logAudit(repo, userEmail, 'create_missing_account', 'Accounts', '', {
          created,
          errors: errors.slice(0, 10),
        });

        return NextResponse.json({
          success: true,
          message: `Создано ${created} счетов${errors.length > 0 ? `, ошибок: ${errors.length}` : ''}`,
          created,
          errors: errors.slice(0, 10),
        });
      }

      // ========== Категоризация операций ==========
      case 'categorize_unclassified': {
        const txIds = data || [];
        let updated = 0;
        const errors: string[] = [];

        for (const txId of txIds) {
          try {
            await repo.update('Transactions', txId, {
              debit_account_id: 'acc-out-other',
              credit_account_id: 'acc-bank-001',
            });
            updated++;
          } catch (e: any) {
            errors.push(`${txId}: ${e.message}`);
          }
        }

        await logAudit(repo, userEmail, 'categorize_unclassified', 'Transactions', '', {
          updated,
          errors: errors.slice(0, 10),
        });

        return NextResponse.json({
          success: true,
          message: `Категоризировано ${updated} операций${errors.length > 0 ? `, ошибок: ${errors.length}` : ''}`,
          updated,
          errors: errors.slice(0, 10),
        });
      }

      // ========== Исправление будущих дат ==========
      case 'fix_future_dates': {
        const txIds = data || [];
        const today = new Date().toISOString().split('T')[0];
        let updated = 0;
        const errors: string[] = [];

        for (const txId of txIds) {
          try {
            await repo.update('Transactions', txId, { date: today });
            updated++;
          } catch (e: any) {
            errors.push(`${txId}: ${e.message}`);
          }
        }

        await logAudit(repo, userEmail, 'fix_future_dates', 'Transactions', '', {
          updated,
          errors: errors.slice(0, 10),
        });

        return NextResponse.json({
          success: true,
          message: `Исправлено ${updated} дат${errors.length > 0 ? `, ошибок: ${errors.length}` : ''}`,
          updated,
          errors: errors.slice(0, 10),
        });
      }

      // ========== Заполнение пустых бюджетов ==========
      case 'fill_empty_budgets': {
        const budgetIds = data || [];
        let updated = 0;
        const errors: string[] = [];

        for (const budgetId of budgetIds) {
          try {
            await repo.update('Budgets', budgetId, { planned_amount: 0, status: 'draft' });
            updated++;
          } catch (e: any) {
            errors.push(`${budgetId}: ${e.message}`);
          }
        }

        await logAudit(repo, userEmail, 'fill_empty_budgets', 'Budgets', '', {
          updated,
          errors: errors.slice(0, 10),
        });

        return NextResponse.json({
          success: true,
          message: `Заполнено ${updated} статей бюджета${errors.length > 0 ? `, ошибок: ${errors.length}` : ''}`,
          updated,
          errors: errors.slice(0, 10),
        });
      }
      // ========== Очистка orphan parent_id ==========
      case 'clear_orphan_parents': {
        const accountIds = data || [];
        const accounts = await repo.getAll('Accounts');
        const validIds = new Set(accounts.map((a: any) => a.id));
        let updated = 0;
        const errors: string[] = [];

        for (const accId of accountIds) {
          try {
            const acc = accounts.find((a: any) => a.id === accId);
            if (!acc) continue;
            if (!acc.parent_id) continue;
            if (validIds.has(acc.parent_id)) continue;

            await repo.update('Accounts', accId, { parent_id: '' });
            updated++;
          } catch (e: any) {
            errors.push(`${accId}: ${e.message}`);
          }
        }

        await logAudit(repo, userEmail, 'clear_orphan_parents', 'Accounts', '', {
          updated,
          errors: errors.slice(0, 10),
        });

        return NextResponse.json({
          success: true,
          message: `Очищено ${updated} parent_id`,
          updated,
          errors: errors.slice(0, 10),
        });
      }

      // ========== Назначение групп ==========
      case 'assign_default_group': {
        const items = data || [];
        let updated = 0;
        const errors: string[] = [];

        for (const item of items) {
          try {
            const groupName = item.type === 'I' ? 'ДОХОДЫ' : 'ОПЕРАЦИОННЫЕ РАСХОДЫ';
            await repo.update('Accounts', item.id, { group_name: groupName });
            updated++;
          } catch (e: any) {
            errors.push(`${item.id}: ${e.message}`);
          }
        }

        await logAudit(repo, userEmail, 'assign_default_group', 'Accounts', '', {
          updated,
          errors: errors.slice(0, 10),
        });

        return NextResponse.json({
          success: true,
          message: `Назначено ${updated} групп`,
          updated,
          errors: errors.slice(0, 10),
        });
      }
      default:
        return NextResponse.json({ success: false, error: 'Неизвестное действие: ' + action }, { status: 400 });
    }

  } catch (error) {
    console.error('Ошибка автоисправления:', error);
    return NextResponse.json(
      { success: false, error: 'Внутренняя ошибка: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * Запись в журнал аудита (не критично, ошибки игнорируются)
 */
async function logAudit(
  repo: any,
  userEmail: string,
  action: string,
  entity: string,
  entityId: string,
  changes: any
): Promise<void> {
  try {
    await repo.create('AuditLog', {
      user_id: userEmail,
      action,
      entity,
      entity_id: entityId,
      changes: JSON.stringify(changes),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // Игнорируем ошибки аудита — не критично
    console.warn('Audit log failed:', e);
  }
}
