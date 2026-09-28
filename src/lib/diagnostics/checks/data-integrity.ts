/**
 * ============================================
 * Уровень 1: Целостность данных
 * ============================================
 */

import { DiagnosticContext, DiagnosticCheck } from '../types';
import { okCheck, problemCheck } from '../engine';

const LEVEL = 1 as const;
const CATEGORY = 'data_integrity' as const;

export async function runDataIntegrityChecks(ctx: DiagnosticContext): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];

    // 1.1 Дубликаты ID
    checks.push(...checkDuplicateIds(ctx));

    // 1.2 Осиротевшие ссылки
    checks.push(...checkOrphanReferences(ctx));

    // 1.3 Обязательные поля
    checks.push(...checkRequiredFields(ctx));

    // 1.4 Валидность enum
    checks.push(...checkEnumValues(ctx));

    // 1.5 Валидность диапазонов
    checks.push(...checkValueRanges(ctx));

    // 1.6 Двойная запись
    checks.push(...checkDoubleEntry(ctx));

    // 1.7 Отрицательные суммы
    checks.push(...checkNegativeAmounts(ctx));

    // 1.8 Нулевые операции
    checks.push(...checkZeroAmounts(ctx));

    // 1.9 Согласованность полей
    checks.push(...checkFieldConsistency(ctx));

    // 1.10 Группы счетов
    checks.push(...checkAccountGroups(ctx));

    // 1.11 Качество данных (сводка)
    checks.push(...await checkDataQuality(ctx));

    return checks;

}

// ============================================
// 1.1 Дубликаты ID
// ============================================
function checkDuplicateIds(ctx: DiagnosticContext): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    const entities: { name: string; items: any[]; idField: string }[] = [
        { name: 'Companies', items: ctx.companies, idField: 'id' },
        { name: 'Accounts', items: ctx.accounts, idField: 'id' },
        { name: 'Transactions', items: ctx.transactions, idField: 'id' },
        { name: 'Counterparties', items: ctx.counterparties, idField: 'id' },
        { name: 'Budgets', items: ctx.budgets, idField: 'id' },
    ];

    for (const entity of entities) {
        const ids = entity.items.map(i => String(i[entity.idField] || '')).filter(Boolean);
        const seen = new Set<string>();
        const duplicates = new Set<string>();

        for (const id of ids) {
            if (seen.has(id)) duplicates.add(id);
            seen.add(id);
        }

        if (duplicates.size > 0) {
            checks.push(problemCheck(
                `duplicate_ids_${entity.name.toLowerCase()}`,
                LEVEL, CATEGORY, 'critical',
                `Дубликаты ID: ${entity.name}`,
                `Найдено ${duplicates.size} дублирующихся ID`,
                {
                    count: duplicates.size,
                    details: { duplicates: Array.from(duplicates).slice(0, 20) },
                    reason: 'Каждая запись должна иметь уникальный ID',
                    recommendation: 'Удалите или переименуйте дубликаты',
                    display: {
                        type: 'list',
                        items: Array.from(duplicates).slice(0, 5).map(id => ({
                            label: id.substring(0, 8) + '...',
                            value: 'дубликат',
                            color: 'red' as const,
                        })),
                    },
                }
            ));
        } else {
            checks.push(okCheck(
                `duplicate_ids_${entity.name.toLowerCase()}`,
                LEVEL, CATEGORY,
                `Дубликаты ID: ${entity.name}`,
                `Все ID уникальны (${ids.length} записей)`
            ));
        }
    }

    return checks;
}

// ============================================
// 1.2 Осиротевшие ссылки
// ============================================
function checkOrphanReferences(ctx: DiagnosticContext): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    const companyIds = new Set(ctx.companies.map(c => c.id));
    const accountIds = new Set(ctx.accounts.map(a => a.id));
    const counterpartyIds = new Set(ctx.counterparties.map(c => c.id));

    // company_id в Transactions
    const orphanCompanyTx = ctx.transactions.filter(t => t.company_id && !companyIds.has(t.company_id));
    checks.push(orphanCheck(
        'orphan_company_tx', 'company_id в операциях', orphanCompanyTx,
        'Компания не существует в справочнике'
    ));

    // debit_account_id
    const orphanDebit = ctx.transactions.filter(t => t.debit_account_id && !accountIds.has(t.debit_account_id));
    const missingDebitAccounts = Array.from(new Set(orphanDebit.map(t => t.debit_account_id)));
    checks.push(orphanCheck(
        'orphan_debit_account', 'debit_account_id в операциях', orphanDebit,
        'Счёт дебета не существует в справочнике',
        {
            action: 'create_missing_account',
            data: missingDebitAccounts,
            info: {
                title: 'Создать недостающие счета',
                description: `Будут созданы ${missingDebitAccounts.length} счетов, на которые ссылаются операции`,
                impact: 'Операции начнут корректно учитываться в отчётах',
                risk: 'Низкий риск. Счета создаются автоматически по префиксу ID.',
            },
        }
    ));

    // credit_account_id
    const orphanCredit = ctx.transactions.filter(t => t.credit_account_id && !accountIds.has(t.credit_account_id));
    checks.push(orphanCheck(
        'orphan_credit_account', 'credit_account_id в операциях', orphanCredit,
        'Счёт кредита не существует в справочнике'
    ));

    // counterparty_id
    const orphanCp = ctx.transactions.filter(t => t.counterparty_id && !counterpartyIds.has(t.counterparty_id));
    checks.push(orphanCheck(
        'orphan_counterparty', 'counterparty_id в операциях', orphanCp,
        'Контрагент не существует в справочнике'
    ));

    // parent_id в Accounts
    const orphanParents = ctx.accounts.filter(a => a.parent_id && !accountIds.has(a.parent_id));
    checks.push(orphanCheck(
        'orphan_account_parent', 'parent_id в счетах', orphanParents,
        'Родительский счёт не существует',
        {
            action: 'clear_orphan_parents',
            data: orphanParents.map(a => a.id),
            info: {
                title: 'Очистить parent_id',
                description: `Будет очищен parent_id у ${orphanParents.length} счетов`,
                impact: 'Группировка в отчётах не пострадает (используется group_name)',
                risk: 'Низкий риск. parent_id не влияет на расчёты.',
            },
        }
    ));

    // company_id в Budgets
    const orphanBudgets = ctx.budgets.filter(b => b.company_id && !companyIds.has(b.company_id));
    checks.push(orphanCheck(
        'orphan_budget_company', 'company_id в бюджетах', orphanBudgets,
        'Компания не существует'
    ));

    // account_id в Budgets
    const orphanBudgetAccounts = ctx.budgets.filter(b => {
        const accId = b.category_id || b.account_id;
        return accId && !accountIds.has(accId);
    });
    checks.push(orphanCheck(
        'orphan_budget_account', 'account_id в бюджетах', orphanBudgetAccounts,
        'Счёт не существует'
    ));

    return checks;
}

function orphanCheck(
    id: string, name: string, items: any[], reason: string,
    autoFix?: { action: string; data: any[]; info: any }
): DiagnosticCheck {
    if (items.length === 0) {
        return okCheck(id, LEVEL, CATEGORY, name, `${name}: все ссылки валидны`);
    }
    return problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        name,
        `${items.length} записей с несуществующими ссылками`,
        {
            count: items.length,
            details: { items: items.slice(0, 20) },
            reason,
            recommendation: autoFix ? 'Нажмите "Исправить автоматически"' : 'Исправьте ссылки или создайте отсутствующие записи',
            auto_fix: !!autoFix,
            auto_fix_action: autoFix?.action,
            auto_fix_data: autoFix?.data,
            auto_fix_info: autoFix?.info,
            display: {
                type: 'list',
                items: items.slice(0, 5).map(i => ({
                    label: i.id ? i.id.substring(0, 8) + '...' : '—',
                    value: reason,
                    color: 'red' as const,
                })),
            },
        }
    );
}

// ============================================
// 1.3 Обязательные поля
// ============================================
function checkRequiredFields(ctx: DiagnosticContext): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    // Transactions: date, amount, company_id, debit_account_id, credit_account_id
    const noDate = ctx.transactions.filter(t => !t.date);
    checks.push(requiredCheck('required_tx_date', 'Дата операции', noDate));

    const noAmount = ctx.transactions.filter(t => t.amount == null || t.amount === '');
    checks.push(requiredCheck('required_tx_amount', 'Сумма операции', noAmount));

    const noCompany = ctx.transactions.filter(t => !t.company_id);
    checks.push(requiredCheck('required_tx_company', 'Компания операции', noCompany));

    const noDebit = ctx.transactions.filter(t => !t.debit_account_id);
    checks.push(requiredCheck('required_tx_debit', 'Счёт дебета', noDebit));

    const noCredit = ctx.transactions.filter(t => !t.credit_account_id);
    checks.push(requiredCheck('required_tx_credit', 'Счёт кредита', noCredit));

    // Accounts: id, type, name
    const noAccType = ctx.accounts.filter(a => !a.type);
    checks.push(requiredCheck('required_acc_type', 'Тип счёта', noAccType));

    const noAccName = ctx.accounts.filter(a => !a.name);
    checks.push(requiredCheck('required_acc_name', 'Название счёта', noAccName));

    // Companies: id, name, tax_system
    const noCompanyName = ctx.companies.filter(c => !c.name);
    checks.push(requiredCheck('required_company_name', 'Название компании', noCompanyName));

    const noTaxSystem = ctx.companies.filter(c => !c.tax_system);
    checks.push(requiredCheck('required_company_tax_system', 'Система налогообложения', noTaxSystem));

    return checks;
}

function requiredCheck(id: string, name: string, items: any[]): DiagnosticCheck {
    if (items.length === 0) {
        return okCheck(id, LEVEL, CATEGORY, name, `${name}: заполнено`);
    }
    return problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        name,
        `${items.length} записей без обязательного поля`,
        {
            count: items.length,
            details: { items: items.slice(0, 20) },
            reason: 'Обязательное поле не заполнено',
            recommendation: 'Заполните поле',
        }
    );
}

// ============================================
// 1.4 Валидность enum
// ============================================
function checkEnumValues(ctx: DiagnosticContext): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    const validTxTypes = ['income', 'expense', 'transfer'];
    const invalidTxType = ctx.transactions.filter(t => t.type && !validTxTypes.includes(t.type));
    checks.push(enumCheck('enum_tx_type', 'Тип операции', invalidTxType, validTxTypes.join(', ')));

    const validRecordTypes = ['fact', 'plan'];
    const invalidRecordType = ctx.transactions.filter(t => t.record_type && !validRecordTypes.includes(t.record_type));
    checks.push(enumCheck('enum_record_type', 'Record type', invalidRecordType, validRecordTypes.join(', ')));

    const validAccTypes = ['A', 'L', 'E', 'I', 'X'];
    const invalidAccType = ctx.accounts.filter(a => a.type && !validAccTypes.includes(a.type));
    checks.push(enumCheck('enum_acc_type', 'Тип счёта', invalidAccType, validAccTypes.join(', ')));

    const validActivities = ['operating', 'investing', 'financing', ''];
    const invalidActivity = ctx.accounts.filter(a => {
        const val = a.activity_type || '';
        return !validActivities.includes(val);
    });
    checks.push(enumCheck('enum_acc_activity', 'Activity type', invalidActivity, validActivities.filter(v => v).join(', ')));

    const validTaxSystems = ['OSNO', 'USN_6', 'USN_15'];
    const invalidTaxSystem = ctx.companies.filter(c => c.tax_system && !validTaxSystems.includes(c.tax_system));
    checks.push(enumCheck('enum_tax_system', 'Система налогообложения', invalidTaxSystem, validTaxSystems.join(', ')));

    return checks;
}

function enumCheck(id: string, name: string, items: any[], validValues: string): DiagnosticCheck {
    if (items.length === 0) {
        return okCheck(id, LEVEL, CATEGORY, name, `${name}: все значения валидны`);
    }
    return problemCheck(
        id, LEVEL, CATEGORY, 'critical',
        name,
        `${items.length} записей с невалидным значением (допустимо: ${validValues})`,
        {
            count: items.length,
            details: { items: items.slice(0, 20).map(i => ({ id: i.id, value: i.type || i.record_type || i.activity_type || i.tax_system })) },
            reason: 'Значение вне допустимого диапазона',
            recommendation: `Исправьте на одно из: ${validValues}`,
        }
    );
}

// ============================================
// 1.5 Валидность диапазонов
// ============================================
function checkValueRanges(ctx: DiagnosticContext): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    // Дата: 2000-2100
    const invalidDates = ctx.transactions.filter(t => {
        if (!t.date) return false;
        const year = parseInt(String(t.date).substring(0, 4));
        return isNaN(year) || year < 2000 || year > 2100;
    });
    if (invalidDates.length > 0) {
        checks.push(problemCheck(
            'range_tx_date', LEVEL, CATEGORY, 'warning',
            'Дата вне диапазона',
            `${invalidDates.length} операций с датой вне [2000-2100]`,
            {
                count: invalidDates.length,
                details: { items: invalidDates.slice(0, 20) },
                recommendation: 'Проверьте даты',
            }
        ));
    } else {
        checks.push(okCheck('range_tx_date', LEVEL, CATEGORY, 'Дата вне диапазона', 'Все даты в диапазоне'));
    }

    // vat_rate для vat_included=true
    const invalidVat = ctx.companies.filter(c => {
        const vatIncluded = String(c.vat_included).toLowerCase() === 'true';
        const rate = parseFloat(String(c.vat_rate || '0'));
        return vatIncluded && (rate <= 0 || rate > 0.5);
    });
    if (invalidVat.length > 0) {
        checks.push(problemCheck(
            'range_vat_rate', LEVEL, CATEGORY, 'warning',
            'Невалидный НДС',
            `${invalidVat.length} компаний с vat_included=true, но vat_rate вне [0, 0.5]`,
            {
                count: invalidVat.length,
                details: { companies: invalidVat.map(c => ({ id: c.id, name: c.name, vat_rate: c.vat_rate })) },
                recommendation: 'Проверьте настройки НДС',
            }
        ));
    } else {
        checks.push(okCheck('range_vat_rate', LEVEL, CATEGORY, 'Невалидный НДС', 'Все ставки НДС корректны'));
    }

    // Будущие даты для fact
    const futureFact = ctx.transactions.filter(t => {
        if (t.record_type !== 'fact') return false;
        const d = String(t.date).split('T')[0];
        return d > ctx.today;
    });
    if (futureFact.length > 0) {
        checks.push(problemCheck(
            'range_future_fact_dates', LEVEL, CATEGORY, 'warning',
            'Будущие даты в фактах',
            `${futureFact.length} операций типа fact с будущей датой`,
            {
                count: futureFact.length,
                details: { items: futureFact.slice(0, 20).map(t => ({ id: t.id, date: t.date, description: t.description })) },
                recommendation: 'Исправьте даты или установите record_type=plan',
                auto_fix: true,
                auto_fix_action: 'fix_future_dates',
                auto_fix_data: futureFact.slice(0, 100).map(t => t.id),
                auto_fix_info: {
                    title: 'Исправить будущие даты',
                    description: 'Даты будут заменены на текущую дату',
                    impact: 'Операции попадут в текущий месяц',
                    risk: 'Высокий риск',
                },
            }
        ));
    } else {
        checks.push(okCheck('range_future_fact_dates', LEVEL, CATEGORY, 'Будущие даты в фактах', 'Будущих дат нет'));
    }

    return checks;
}

// ============================================
// 1.6 Двойная запись
// ============================================
function checkDoubleEntry(ctx: DiagnosticContext): DiagnosticCheck[] {
    const sameAccount = ctx.transactions.filter(t =>
        t.debit_account_id && t.credit_account_id &&
        t.debit_account_id === t.credit_account_id &&
        t.type !== 'transfer'
    );

    if (sameAccount.length > 0) {
        return [problemCheck(
            'double_entry_same_account', LEVEL, CATEGORY, 'critical',
            'Двойная запись',
            `${sameAccount.length} операций с одинаковым счётом дебета и кредита`,
            {
                count: sameAccount.length,
                details: { items: sameAccount.slice(0, 20) },
                reason: 'Дебет и кредит должны отличаться',
                recommendation: 'Исправьте счета',
            }
        )];
    }
    return [okCheck('double_entry_same_account', LEVEL, CATEGORY, 'Двойная запись', 'Все операции корректны')];
}

// ============================================
// 1.7 Отрицательные суммы
// ============================================
function checkNegativeAmounts(ctx: DiagnosticContext): DiagnosticCheck[] {
    const negative = ctx.transactions.filter(t => parseFloat(String(t.amount_rub || 0)) < 0);
    if (negative.length > 0) {
        return [problemCheck(
            'negative_amounts', LEVEL, CATEGORY, 'warning',
            'Отрицательные суммы',
            `${negative.length} операций с отрицательной суммой`,
            {
                count: negative.length,
                details: { items: negative.slice(0, 20).map(t => ({ id: t.id, amount: t.amount_rub, description: t.description })) },
                recommendation: 'Проверьте операции',
            }
        )];
    }
    return [okCheck('negative_amounts', LEVEL, CATEGORY, 'Отрицательные суммы', 'Отрицательных сумм нет')];
}

// ============================================
// 1.8 Нулевые операции
// ============================================
function checkZeroAmounts(ctx: DiagnosticContext): DiagnosticCheck[] {
    const zero = ctx.transactions.filter(t => parseFloat(String(t.amount_rub || 0)) === 0);
    if (zero.length > 0) {
        return [problemCheck(
            'zero_amounts', LEVEL, CATEGORY, 'info',
            'Нулевые суммы',
            `${zero.length} операций с нулевой суммой`,
            {
                count: zero.length,
                details: { items: zero.slice(0, 20).map(t => ({ id: t.id, description: t.description })) },
                recommendation: null,
            }
        )];
    }
    return [okCheck('zero_amounts', LEVEL, CATEGORY, 'Нулевые суммы', 'Нулевых операций нет')];
}

// ============================================
// 1.9 Согласованность полей
// ============================================
function checkFieldConsistency(ctx: DiagnosticContext): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    // vat_included=true → vat_rate>0
    const vatInconsistency = ctx.companies.filter(c => {
        const vatIncluded = String(c.vat_included).toLowerCase() === 'true';
        const rate = parseFloat(String(c.vat_rate || '0'));
        return vatIncluded && rate === 0;
    });
    if (vatInconsistency.length > 0) {
        checks.push(problemCheck(
            'consistency_vat', LEVEL, CATEGORY, 'warning',
            'Согласованность НДС',
            `${vatInconsistency.length} компаний с vat_included=true, но vat_rate=0`,
            {
                count: vatInconsistency.length,
                details: { companies: vatInconsistency.map(c => ({ id: c.id, name: c.name })) },
                recommendation: 'Установите vat_rate или vat_included=false',
            }
        ));
    } else {
        checks.push(okCheck('consistency_vat', LEVEL, CATEGORY, 'Согласованность НДС', 'Всё согласовано'));
    }

    return checks;
}
// ============================================
// 1.10 Группы счетов (group_name)
// ============================================
function checkAccountGroups(ctx: DiagnosticContext): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];

    // Счета с пустым group_name
    const noGroupName = ctx.accounts.filter(a =>
        (a.type === 'I' || a.type === 'X') && !a.group_name
    );

    if (noGroupName.length > 0) {
        checks.push(problemCheck(
            'account_no_group_name', LEVEL, CATEGORY, 'info',
            'Счета без группы',
            `${noGroupName.length} счетов без group_name`,
            {
                count: noGroupName.length,
                details: { items: noGroupName.slice(0, 20).map(a => ({ id: a.id, name: a.name })) },
                recommendation: 'Заполните group_name для группировки в отчётах',
                auto_fix: true,
                auto_fix_action: 'assign_default_group',
                auto_fix_data: noGroupName.map(a => ({ id: a.id, type: a.type })),
                auto_fix_info: {
                    title: 'Назначить группы',
                    description: 'Доходы → ДОХОДЫ, Расходы → ОПЕРАЦИОННЫЕ РАСХОДЫ',
                    impact: 'Счета появятся в структуре отчётов',
                    risk: 'Низкий риск',
                },
            }
        ));
    } else {
        checks.push(okCheck('account_no_group_name', LEVEL, CATEGORY, 'Счета без группы', 'У всех счетов есть группа'));
    }

    return checks;
}
// ============================================
// 1.11 Сводка по качеству данных
// ============================================
async function checkDataQuality(ctx: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const id = 'data_quality_summary';
  try {
    const { getRepository } = await import('@/lib/dal/repository');
    const { dataQualityEngine } = await import('@/lib/data-quality/engine');

    const repo = getRepository();
    const [rulesRaw, exceptions] = await Promise.all([
      repo.getAll('DataQualityRules'),
      repo.getAll('DataQualityExceptions'),
    ]);

    const rules = rulesRaw
      .filter((r: any) => !r.is_deleted && r.is_active)
      .map((r: any) => ({
        ...r,
        condition: safeParse(r.condition),
        params: safeParse(r.params),
        suggested_actions: safeParse(r.suggested_actions),
      }));

    if (rules.length === 0) {
      return [okCheck(id, LEVEL, CATEGORY, 'Качество данных', 'Правила не настроены')];
    }

    const violations = dataQualityEngine.run(
      rules,
      {
        transactions: ctx.transactions,
        accounts: ctx.accounts,
        companies: ctx.companies,
        budgets: ctx.budgets,
      },
      exceptions,
    );

    if (violations.length === 0) {
      return [okCheck(id, LEVEL, CATEGORY, 'Качество данных', 'Нарушений нет')];
    }

    const critical = violations.filter(v => v.severity === 'critical').length;
    const warning = violations.filter(v => v.severity === 'warning').length;
    const info = violations.filter(v => v.severity === 'info').length;

    const severity = critical > 0 ? 'critical' : warning > 0 ? 'warning' : 'info';

    return [problemCheck(
      id, LEVEL, CATEGORY, severity,
      'Качество данных',
      `${violations.length} нарушений (${critical} критичных, ${warning} warning, ${info} info)`,
      {
        count: violations.length,
        details: {
          total: violations.length,
          critical,
          warning,
          info,
        },
        reason: 'Операции не соответствуют правилам качества данных',
        recommendation: 'Разобрать нарушения в разделе «Качество данных»',
        display: {
          type: 'list',
          items: [
            { label: 'Нарушений', value: String(violations.length), color: severity === 'critical' ? 'red' : 'yellow' },
            { label: 'Критичных', value: String(critical), color: critical > 0 ? 'red' : 'gray' },
          ],
        },
      },
    )];
  } catch (e: any) {
    return [okCheck(id, LEVEL, CATEGORY, 'Качество данных', `Недоступно: ${e.message}`)];
  }
}

function safeParse(s: any): any {
  if (!s) return null;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return null; }
}
