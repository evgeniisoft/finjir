'use client';

import { useState } from 'react';

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

export default function RuleEditor({ rule, onSave, onCancel }: any) {
  const isEdit = Boolean(rule?.id);

  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [category, setCategory] = useState(rule?.category || 'classification');
  const [ruleType, setRuleType] = useState(rule?.rule_type || 'must_not_contain');
  const [entityType, setEntityType] = useState(rule?.entity_type || 'Transactions');
  const [targetField, setTargetField] = useState(rule?.target_field || 'description');
  const [accountId, setAccountId] = useState(rule?.condition?.debit_account_id || '');
  const [accountIdLike, setAccountIdLike] = useState(rule?.condition?.debit_account_id_like || '');
  const [keywords, setKeywords] = useState<string[]>(rule?.params?.keywords || []);
  const [keywordInput, setKeywordInput] = useState('');
  const [rangeMin, setRangeMin] = useState(rule?.params?.min ?? '');
  const [rangeMax, setRangeMax] = useState(rule?.params?.max ?? '');
  const [severity, setSeverity] = useState(rule?.severity || 'warning');
  const [isActive, setIsActive] = useState(rule?.is_active !== false);
  const [saving, setSaving] = useState(false);

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

    const condition: any = {};
    if (accountId) condition.debit_account_id = accountId;
    if (accountIdLike) condition.debit_account_id_like = accountIdLike;

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
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Поле</label>
            <input
              value={targetField}
              onChange={(e) => setTargetField(e.target.value)}
              placeholder="description | amount_rub | ..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Условие применения</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Точный счёт (debit_account_id =)</label>
                <input
                  value={accountId}
                  onChange={(e) => { setAccountId(e.target.value); setAccountIdLike(''); }}
                  placeholder="acc-out-training"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Или шаблон (debit_account_id LIKE)</label>
                <input
                  value={accountIdLike}
                  onChange={(e) => { setAccountIdLike(e.target.value); setAccountId(''); }}
                  placeholder="acc-out-%"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
              </div>
            </div>
          </div>

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
