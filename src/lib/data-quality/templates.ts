/**
 * ============================================
 * FinEngine 2026 - Data Quality
 * Шаблоны problem/explanation/actions
 * ============================================
 */

import { DataQualityRule, SuggestedAction } from './types';

/**
 * Дефолтный problem_template по типу правила.
 */
export function defaultProblemTemplate(rule: Partial<DataQualityRule>): string {
  switch (rule.rule_type) {
    case 'must_contain':
      return `Описание «{description}» не содержит ожидаемых слов для счёта «{account_name}»`;
    case 'must_not_contain':
      return `Описание «{description}» содержит слова, недопустимые для счёта «{account_name}»`;
    case 'required_field':
      return `Поле «${rule.target_field}» не заполнено`;
    case 'range':
      return `Значение «{${rule.target_field}}» вне допустимого диапазона`;
    case 'enum':
      return `Значение «{${rule.target_field}}» не входит в список допустимых`;
    case 'regex':
      return `Значение «{${rule.target_field}}» не соответствует формату`;
    default:
      return 'Нарушение правила качества данных';
  }
}

/**
 * Дефолтный explanation_template.
 * {suggested_account} подставляется движком при fuzzy-match.
 */
export function defaultExplanationTemplate(rule: Partial<DataQualityRule>): string {
  switch (rule.rule_type) {
    case 'must_contain':
      return 'Проверьте описание операции — возможно, оно было введено ошибочно.';
    case 'must_not_contain':
      return 'Описание операции не соответствует выбранному счёту. В системе может быть более подходящий счёт «{suggested_account}».';
    case 'required_field':
      return 'Заполните обязательное поле для корректного отражения операции в отчётах.';
    case 'range':
      return 'Проверьте числовое значение — оно выходит за пределы допустимого диапазона.';
    case 'enum':
      return 'Выберите значение из допустимого списка.';
    case 'regex':
      return 'Проверьте формат значения — он не соответствует ожидаемому.';
    default:
      return 'Проверьте данные и исправьте нарушение.';
  }
}

/**
 * Дефолтные suggested_actions по типу правила.
 *
 * Для must_not_contain:
 *   - если передан entity (конкретная транзакция) — используем suggestAccountForEntity
 *     (матч по description конкретной транзакции);
 *   - если entity не передан (редактор правила) — используем suggestAccountByKeywords
 *     (матч по keywords правила).
 */
export function defaultActionsForRule(
  rule: Partial<DataQualityRule>,
  data: { accounts: any[]; companies: any[] },
  entity?: any,
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  switch (rule.rule_type) {
    case 'must_not_contain': {
      // Если есть конкретная транзакция — матчим по её description.
      // Иначе (редактор правила) — матчим по keywords правила.
      const suggestion = entity
        ? suggestAccountForEntity(entity, data.accounts)
        : suggestAccountByKeywords(rule.params?.keywords || [], data.accounts);

      if (suggestion) {
        actions.push({
          id: 'reassign',
          type: 'reassign_account',
          label: `Перенести на «${suggestion.name}»`,
          description: `Операция перейдёт в категорию «${suggestion.name}»`,
          config: { new_account_id: suggestion.id, field: 'debit' },
          preview_capable: true,
        });
      }

      actions.push({
        id: 'edit',
        type: 'edit_field',
        label: 'Исправить описание',
        description: 'Введите правильное описание',
        config: { field: 'description' },
        requires_input: true,
        input_field: 'description',
        input_label: 'Новое описание',
        preview_capable: false,
      });

      actions.push({
        id: 'exception',
        type: 'create_exception',
        label: 'Это корректно → исключить из проверки',
        description: 'Транзакция больше не появится в проверках по этому правилу',
        config: {},
        preview_capable: false,
      });

      actions.push({
        id: 'delete',
        type: 'delete_entity',
        label: 'Удалить транзакцию',
        description: 'Удаление необратимо — операция исчезнет из всех отчётов',
        config: {},
        is_destructive: true,
        preview_capable: true,
      });

      return actions;
    }

    case 'must_contain': {
      actions.push({
        id: 'edit',
        type: 'edit_field',
        label: 'Исправить описание',
        description: 'Введите правильное описание',
        config: { field: 'description' },
        requires_input: true,
        input_field: 'description',
        input_label: 'Новое описание',
        preview_capable: false,
      });

      actions.push({
        id: 'exception',
        type: 'create_exception',
        label: 'Это корректно → исключить',
        description: 'Транзакция больше не появится в проверках',
        config: {},
        preview_capable: false,
      });

      return actions;
    }

    case 'required_field': {
      actions.push({
        id: 'edit',
        type: 'edit_field',
        label: `Заполнить «${rule.target_field}»`,
        description: 'Введите значение поля',
        config: { field: rule.target_field },
        requires_input: true,
        input_field: rule.target_field,
        input_label: rule.target_field,
        preview_capable: false,
      });

      actions.push({
        id: 'exception',
        type: 'create_exception',
        label: 'Оставить пустым',
        description: 'Транзакция больше не появится в проверках',
        config: {},
        preview_capable: false,
      });

      return actions;
    }

    case 'range':
    case 'enum':
    case 'regex': {
      actions.push({
        id: 'edit',
        type: 'edit_field',
        label: `Исправить «${rule.target_field}»`,
        description: 'Введите корректное значение',
        config: { field: rule.target_field },
        requires_input: true,
        input_field: rule.target_field,
        input_label: rule.target_field,
        preview_capable: false,
      });

      actions.push({
        id: 'exception',
        type: 'create_exception',
        label: 'Это корректно → исключить',
        description: 'Транзакция больше не появится в проверках',
        config: {},
        preview_capable: false,
      });

      return actions;
    }

    default:
      return [];
  }
}

/**
 * Fuzzy match по keywords правила.
 *
 * Используется в редакторе правила (когда нет конкретной транзакции).
 * Ищет X-счёт, чьё имя пересекается с keywords.
 */
export function suggestAccountByKeywords(keywords: string[], accounts: any[]): any | null {
  if (!keywords || keywords.length === 0) return null;

  const normalized = keywords.map(k => k.toLowerCase().trim()).filter(Boolean);
  if (normalized.length === 0) return null;

  let best: { account: any; score: number; nameLen: number } | null = null;

  for (const acc of accounts) {
    if (acc.type !== 'X') continue;
    const accName = String(acc.name || '').toLowerCase().trim();
    if (!accName) continue;

    const accWords = accName.split(/\s+/).filter(w => w.length >= 3);
    let score = 0;

    for (const accWord of accWords) {
      if (normalized.includes(accWord)) {
        score += 2;
        continue;
      }
      const stem = accWord.length > 5 ? accWord.slice(0, accWord.length - 2) : accWord;
      if (normalized.some(kw => kw.includes(stem) || stem.includes(kw) || accWord.includes(kw) || kw.includes(accWord))) {
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

/**
 * Fuzzy match по description конкретной транзакции.
 *
 * Используется в wizard (когда есть конкретная транзакция).
 * Ищет X-счёт, чьё имя максимально пересекается со словами description.
 * Исключает текущий счёт транзакции.
 *
 * Логика score:
 *   +2 — точное совпадение целого слова
 *   +1 — совпадение по стеммингу (обрезка окончаний)
 * Tiebreaker: при равном score выбирается счёт с более коротким именем.
 */
export function suggestAccountForEntity(entity: any, accounts: any[]): any | null {
  const desc = String(entity.description || '').toLowerCase().trim();
  if (!desc) return null;

  const currentAccountId = entity.debit_account_id || entity.credit_account_id;
  const descWords = desc.split(/\s+/).filter(w => w.length >= 4);
  if (descWords.length === 0) return null;

  let best: { account: any; score: number; nameLen: number } | null = null;

  for (const acc of accounts) {
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
