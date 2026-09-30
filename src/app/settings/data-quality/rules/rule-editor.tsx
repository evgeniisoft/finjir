'use client';

import { useEffect, useState } from 'react';
import ConditionEditor from './condition-editor';

const RULE_TYPES = [
  { value: 'must_contain', label: 'Должно содержать' },
  { value: 'must_not_contain', label: 'Не должно содержать' },
  { value: 'required_field', label: 'Обязательное поле' },
  { value: 'range', label: 'Диапазон значений' },
  { value: 'enum', label: 'Одно из значений' },
  { value: 'regex', label: 'Соответствие regex' },
];

const ENTITY_TYPES = [
  { value: 'Transactions', label: 'Операции' },
  { value: 'Accounts', label: 'Счета' },
  { value: 'Companies', label: 'Компании' },
  { value: 'Budgets', label: 'Бюджеты' },
];

const SEVERITIES = [
  { value: 'critical', label: 'Критично' },
  { value: 'warning', label: 'Предупреждение' },
  { value: 'info', label: 'Инфо' },
];

const TARGET_FIELDS = [
  { value: 'description', label: 'Описание' },
  { value: 'counterparty_id', label: 'Контрагент' },
  { value: 'amount_rub', label: 'Сумма' },
  { value: 'date', label: 'Дата' },
  { value: 'type', label: 'Тип' },
  { value: 'record_type', label: 'Record type' },
  { value: 'company_id', label: 'Компания' },
];

interface ConditionItem {
  field: string;
  op: 'eq' | 'neq' | 'like' | 'not_like' | 'in' | 'not_in';
  value: any;
}

export default function RuleEditor({ rule, onSave, onCancel, accounts = [] }: any) {
  const isEdit = Boolean(rule?.id);

  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [category, setCategory] = useState(rule?.category || 'classification');
  const [ruleType, setRuleType] = useState(rule?.rule_type || 'must_not_contain');
  const [entityType, setEntityType] = useState(rule?.entity_type || 'Transactions');
  const [targetField, setTargetField] = useState(rule?.target_field || 'description');
  const [keywords, setKeywords] = useState<string[]>(rule?.params?.keywords || []);
  const [keywordInput, setKeywordInput] = useState('');
  const [rangeMin, setRangeMin] = useState(rule?.params?.min ?? '');
  const [rangeMax, setRangeMax] = useState(rule?.params?.max ?? '');
  const [severity, setSeverity] = useState(rule?.severity || 'warning');
  const [isActive, setIsActive] = useState(rule?.is_active !== false);
  const [saving, setSaving] = useState(false);
  const [conditions, setConditions] = useState<ConditionItem[]>([]);

  // Загрузка условий из правила (поддержка старого и нового формата)
  useEffect(() => {
    if (!rule?.condition) {
      setConditions([]);
      return;
    }
    const cond = rule.condition;

    // Новый формат
    if (cond.and && Array.isArray(cond.and)) {
      setConditions(cond.and);
      return;
    }
    if (cond.or && Array.isArray(cond.or)) {
      setConditions(cond.or);
      return;
    }

    // Старый формат — конвертируем
    const converted: ConditionItem[] = [];
    for (const [key, value] of Object.entries(cond)) {
      if (key.endsWith('_like')) {
        converted.push({ field: key.replace(/_like$/, ''), op: 'like', value });
      } else if (key.endsWith('_not_like')) {
        converted.push({ field: key.replace(/_not_like$/, ''), op: 'not_like', value });
      } else if (key.endsWith('_in')) {
        converted.push({ field: key.replace(/_in$/, ''), op: 'in', value });
      } else if (key.endsWith('_not_in')) {
        converted.push({ field: key.replace(/_not_in$/, ''), op: 'not_in', value });
      } else if (key.endsWith('_neq')) {
        converted.push({ field: key.replace(/_neq$/, ''), op: 'neq', value });
      } else {
        converted.push({ field: key, op: 'eq', value });
      }
    }
    setConditions(converted);
  }, [rule]);

  const addKeyword = () => {
    const k = keywordInput.trim().toLowerCase();
    if (k && !keywords.includes(k)) {
      setKeywords([...keywords, k]);
      setKeywordInput('');
    }
  };

  const removeKeyword = (k: string) => {
    setKeywords(keywords.filter(x => x !== k));
  };

  const handleSave = async () => {
    if (!name.trim()) { alert('Введите название'); return; }

    // Валидация условий
    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i];
      if (!c.field || !c.op) {
        alert(`Условие ${i + 1}: заполните поле и оператор`);
        return;
      }
      if ((c.op === 'in' || c.op === 'not_in') && (!Array.isArray(c.value) || c.value.length === 0)) {
        alert(`Условие ${i + 1}: добавьте хотя бы одно значение`);
        return;
      }
      if (c.op !== 'in' && c.op !== 'not_in' && (c.value === '' || c.value == null)) {
        alert(`Условие ${i + 1}: заполните значение`);
        return;
      }
    }

    // Собираем condition
    const condition = conditions.length > 0
      ? { and: conditions }
      : {};

    // Параметры
    const params: any = {};
    if (ruleType === 'must_contain' || ruleType === 'must_not_contain') {
      if (keywords.length === 0) { alert('Добавьте хотя бы одно ключевое слово'); return; }
      params.keywords = keywords;
    }
    if (ruleType === 'range') {
      if (rangeMin !== '') params.min = parseFloat(String(rangeMin));
      if (rangeMax !== '') params.max = parseFloat(String(rangeMax));
    }

    setSaving(true);
    try {
      await onSave({
        name,
        description,
        category,
        rule_type: ruleType,
        entity_type: entityType,
        target_field: targetField,
        condition,
        params,
        severity,
        is_active: isActive,
      });
    } finally {
      setSaving(false);
    }
  };

  const needsKeywords = ruleType === 'must_contain' || ruleType === 'must_not_contain';
  const needsRange = ruleType === 'range';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            {isEdit ? 'Редактировать правило' : 'Новое правило'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Обучение не содержит 'аренда'"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Тип правила</label>
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {RULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Сущность</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Проверяемое поле</label>
            <select
              value={targetField}
              onChange={(e) => setTargetField(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {TARGET_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          {/* Условия */}
          <ConditionEditor
            conditions={conditions}
            onChange={setConditions}
            accounts={accounts}
            entityType={entityType}
          />

          {needsKeywords && (
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ключевые слова</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {keywords.map(k => (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs">
                    {k}
                    <button onClick={() => removeKeyword(k)} className="hover:text-blue-900">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                  placeholder="Введите слово и Enter"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  onClick={addKeyword}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                >
                  Добавить
                </button>
              </div>
            </div>
          )}

          {needsRange && (
            <div className="border-t border-gray-100 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Мин.</label>
                  <input
                    type="number"
                    value={rangeMin}
                    onChange={(e) => setRangeMin(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Макс.</label>
                  <input
                    type="number"
                    value={rangeMax}
                    onChange={(e) => setRangeMax(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Важность</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded"
                />
                Правило активно
              </label>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
