'use client';

import { useEffect, useMemo, useState } from 'react';

export interface ConditionItem {
  field: string;
  op: 'eq' | 'neq' | 'like' | 'not_like' | 'in' | 'not_in';
  value: any;
}

interface ConditionEditorProps {
  conditions: ConditionItem[];
  onChange: (conditions: ConditionItem[]) => void;
  accounts: any[];
  entityType: string;
}

const OP_OPTIONS = [
  { value: 'eq', label: '= (равно)' },
  { value: 'neq', label: '≠ (не равно)' },
  { value: 'like', label: 'LIKE (шаблон с %)' },
  { value: 'not_like', label: 'NOT LIKE (не шаблон)' },
  { value: 'in', label: 'IN (в списке)' },
  { value: 'not_in', label: 'NOT IN (не в списке)' },
];

const FIELD_OPTIONS = [
  { value: 'debit_account_id', label: 'Счёт дебета', type: 'account' },
  { value: 'credit_account_id', label: 'Счёт кредита', type: 'account' },
  { value: 'type', label: 'Тип', type: 'enum', values: ['income', 'expense', 'transfer'] },
  { value: 'record_type', label: 'Record type', type: 'enum', values: ['fact', 'plan'] },
  { value: 'company_id', label: 'Компания', type: 'text' },
  { value: 'description', label: 'Описание', type: 'text' },
  { value: 'amount_rub', label: 'Сумма', type: 'number' },
];

export default function ConditionEditor({
  conditions,
  onChange,
  accounts,
  entityType,
}: ConditionEditorProps) {
  const addCondition = () => {
    onChange([
      ...conditions,
      { field: 'debit_account_id', op: 'eq', value: '' },
    ]);
  };

  const updateCondition = (idx: number, patch: Partial<ConditionItem>) => {
    const next = [...conditions];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeCondition = (idx: number) => {
    onChange(conditions.filter((_, i) => i !== idx));
  };

  const maxReached = conditions.length >= 5;

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-700">
          Условия применения {conditions.length > 0 && `(${conditions.length} из 5)`}
        </p>
        <button
          type="button"
          onClick={addCondition}
          disabled={maxReached}
          className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
        >
          + Добавить условие
        </button>
      </div>

      {conditions.length === 0 && (
        <p className="text-xs text-gray-500 mb-3">
          Без условий правило применяется ко всем записям.
        </p>
      )}

      <div className="space-y-3">
        {conditions.map((cond, idx) => (
          <ConditionRow
            key={idx}
            cond={cond}
            idx={idx}
            accounts={accounts}
            onChange={(patch) => updateCondition(idx, patch)}
            onRemove={() => removeCondition(idx)}
          />
        ))}
      </div>

      {conditions.length > 1 && (
        <p className="text-xs text-gray-500 mt-3">
          Все условия должны выполняться (логика И).
        </p>
      )}
    </div>
  );
}

// ============================================
// Одна строка условия
// ============================================

function ConditionRow({
  cond,
  idx,
  accounts,
  onChange,
  onRemove,
}: {
  cond: ConditionItem;
  idx: number;
  accounts: any[];
  onChange: (patch: Partial<ConditionItem>) => void;
  onRemove: () => void;
}) {
  const fieldMeta = FIELD_OPTIONS.find(f => f.value === cond.field);
  const fieldType = fieldMeta?.type || 'text';

  const handleFieldChange = (field: string) => {
    const newMeta = FIELD_OPTIONS.find(f => f.value === field);
    let newValue: any = '';
    let newOp: ConditionItem['op'] = cond.op;

    if (newMeta?.type === 'account') {
      newOp = cond.op === 'in' || cond.op === 'not_in' ? cond.op : 'eq';
      newValue = newOp === 'in' || newOp === 'not_in' ? [] : '';
    } else if (newMeta?.type === 'enum') {
      newOp = 'eq';
      newValue = '';
    } else if (newMeta?.type === 'number') {
      newOp = 'eq';
      newValue = '';
    }

    onChange({ field, op: newOp, value: newValue });
  };

  const handleOpChange = (op: ConditionItem['op']) => {
    let newValue: any = cond.value;
    if ((op === 'in' || op === 'not_in') && !Array.isArray(newValue)) {
      newValue = [];
    }
    if ((op === 'eq' || op === 'neq' || op === 'like' || op === 'not_like') && Array.isArray(newValue)) {
      newValue = '';
    }
    onChange({ op, value: newValue });
  };

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1 grid grid-cols-12 gap-2">
        <select
          value={cond.field}
          onChange={(e) => handleFieldChange(e.target.value)}
          className="col-span-3 px-2 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {FIELD_OPTIONS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        <select
          value={cond.op}
          onChange={(e) => handleOpChange(e.target.value as ConditionItem['op'])}
          className="col-span-3 px-2 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {OP_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="col-span-6">
          <ValueInput
            cond={cond}
            fieldType={fieldType}
            fieldMeta={fieldMeta}
            accounts={accounts}
            onChange={(value) => onChange({ value })}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
        title="Удалить условие"
      >
        🗑️
      </button>
    </div>
  );
}

// ============================================
// Ввод значения
// ============================================

function ValueInput({
  cond,
  fieldType,
  fieldMeta,
  accounts,
  onChange,
}: {
  cond: ConditionItem;
  fieldType: string;
  fieldMeta: any;
  accounts: any[];
  onChange: (value: any) => void;
}) {
  const isMulti = cond.op === 'in' || cond.op === 'not_in';

  // Enum
  if (fieldType === 'enum' && !isMulti) {
    return (
      <select
        value={String(cond.value || '')}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"
      >
        <option value="">— выберите —</option>
        {(fieldMeta?.values || []).map((v: string) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    );
  }

  // Account single
  if (fieldType === 'account' && !isMulti) {
    return (
      <select
        value={String(cond.value || '')}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"
      >
        <option value="">— выберите счёт —</option>
        {accounts
          .filter(a => a.type === 'I' || a.type === 'X')
          .map(a => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.id})
            </option>
          ))}
      </select>
    );
  }

  // Account multi
  if (fieldType === 'account' && isMulti) {
    return (
      <AccountMultiSelect
        value={Array.isArray(cond.value) ? cond.value : []}
        accounts={accounts}
        onChange={onChange}
      />
    );
  }

  // LIKE / NOT LIKE
  if (cond.op === 'like' || cond.op === 'not_like') {
    return (
      <input
        type="text"
        value={String(cond.value || '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder="acc-out-%"
        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm font-mono"
      />
    );
  }

  // Number
  if (fieldType === 'number') {
    return (
      <input
        type="number"
        value={cond.value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"
      />
    );
  }

  // Text / fallback
  return (
    <input
      type="text"
      value={String(cond.value || '')}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"
    />
  );
}

// ============================================
// Multi-select счетов
// ============================================

function AccountMultiSelect({
  value,
  accounts,
  onChange,
}: {
  value: string[];
  accounts: any[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState('');

  const relevant = accounts.filter(a => a.type === 'I' || a.type === 'X');
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return relevant;
    return relevant.filter(a =>
      a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
    );
  }, [search, relevant]);

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const removeAll = () => onChange([]);

  return (
    <div className="border border-gray-300 rounded-lg">
      {/* Выбранные */}
      {value.length > 0 && (
        <div className="px-2 py-1.5 border-b border-gray-100 flex flex-wrap gap-1 items-center">
          {value.map(id => {
            const acc = accounts.find(a => a.id === id);
            return (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                {acc?.name || id}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="hover:text-blue-900"
                >×</button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={removeAll}
            className="text-xs text-gray-400 hover:text-red-600 ml-auto"
          >
            Очистить
          </button>
        </div>
      )}

      {/* Поиск */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск счёта..."
        className="w-full px-2 py-1.5 text-sm border-b border-gray-100 focus:outline-none"
      />

      {/* Список */}
      <div className="max-h-40 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-2 py-2 text-xs text-gray-400">Ничего не найдено</p>
        ) : (
          filtered.map(a => {
            const checked = value.includes(a.id);
            return (
              <label
                key={a.id}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(a.id)}
                  className="rounded"
                />
                <span className="flex-1 text-gray-900">{a.name}</span>
                <span className="text-xs text-gray-400 font-mono">{a.id}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
