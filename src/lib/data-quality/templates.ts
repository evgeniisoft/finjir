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
 * Для must_not_contain — пытаемся найти подходящий счёт через fuzzy match.
 */
export function defaultActionsForRule(
  rule: Partial<DataQualityRule>,
  data: { accounts: any[]; companies: any[] },
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  switch (rule.rule_type) {
    case 'must_not_contain': {
      // Ищем счёт, подходящий под keywords.
      const suggestion = suggestAccountByKeywords(rule.params?.keywords || [], data.accounts);

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
 * Fuzzy match: ищем X-счёт, чьё имя пересекается с keywords.
 * Простой алгоритм: первое слово из имени счёта встречается в keywords
 * или одно из keywords входит в имя счёта.
 */
function suggestAccountByKeywords(keywords: string[], accounts: any[]): any | null {
  if (!keywords || keywords.length === 0) return null;

  const normalized = keywords.map(k => k.toLowerCase());

  for (const acc of accounts) {
    if (acc.type !== 'X') continue;
    const accName = String(acc.name || '').toLowerCase();
    if (!accName) continue;

    // Первое слово имени счёта
    const firstWord = accName.split(/\s+/)[0];
    if (firstWord && normalized.some(k => k.includes(firstWord) || firstWord.includes(k))) {
      return acc;
    }

    // Любое слово из имени счёта
    const words = accName.split(/\s+/).filter(w => w.length >= 3);
    if (words.some(w => normalized.some(k => k.includes(w)))) {
      return acc;
    }
  }

  return null;
}

/**
 * Публичная версия suggestAccountByKeywords — используется в engine.
 */
export { suggestAccountByKeywords };
