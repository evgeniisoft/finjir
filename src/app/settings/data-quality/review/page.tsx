'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  runChecks,
  previewAction,
  applyAction,
  applyBulk,
  createException,
  fmtMoney,
  fmtDiff,
  severityLabel,
  severityColor,
} from '@/lib/data-quality/client';

export default function ReviewPage() {
  const [loading, setLoading] = useState(true);
  const [violations, setViolations] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [userInput, setUserInput] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkPreview, setBulkPreview] = useState<any>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const run = await runChecks();
      setViolations(run.violations || []);
    } finally {
      setLoading(false);
    }
  };

  const activeViolations = useMemo(
    () => violations.filter(v => !skipped.has(v.entity_id)),
    [violations, skipped],
  );

  const current = activeViolations[index];

  const resetForNext = () => {
    setSelectedActionId(null);
    setUserInput('');
    setPreview(null);
  };

  const handleSelectAction = async (action: any) => {
    setSelectedActionId(action.id);
    setPreview(null);
    if (action.preview_capable && !action.requires_input) {
      await doPreview(action, undefined);
    }
  };

  const doPreview = async (action: any, input: any) => {
    setPreviewLoading(true);
    try {
      const res = await previewAction({
        entity_id: current.entity_id,
        action,
        user_input: input,
      });
      setPreview(res);
    } finally {
      setPreviewLoading(false);
    }
  };

  const selectedAction = current?.suggested_actions.find((a: any) => a.id === selectedActionId);

  const handleApply = async () => {
    if (!selectedAction) return;
    if (selectedAction.requires_input && !userInput.trim()) {
      alert('Введите значение');
      return;
    }

    setApplyLoading(true);
    try {
      const res = await applyAction({
        entity_id: current.entity_id,
        action: selectedAction,
        user_input: selectedAction.requires_input ? { value: userInput } : undefined,
        rule_id: current.rule_id,
      });
      if (!res.success) {
        alert('Ошибка: ' + res.error);
        return;
      }
      resetForNext();
      // Уходим на следующий — либо следующий в списке, либо перезагрузка
      if (index + 1 >= activeViolations.length) {
        await load();
        setIndex(0);
      } else {
        setIndex(index + 1);
      }
    } finally {
      setApplyLoading(false);
    }
  };

  const handleSkip = () => {
    resetForNext();
    if (index + 1 >= activeViolations.length) {
      setIndex(0);
    } else {
      setIndex(index + 1);
    }
  };

  const handleSkipRule = () => {
    if (!current) return;
    const ruleId = current.rule_id;
    const newSkipped = new Set(skipped);
    violations.forEach(v => { if (v.rule_id === ruleId) newSkipped.add(v.entity_id); });
    setSkipped(newSkipped);
    setIndex(0);
    resetForNext();
  };

  // ==== BULK ====
  const bulkCandidates = useMemo(() => {
    if (!current) return [];
    // Все нарушения того же правила и с тем же action
    return violations.filter(v =>
      v.rule_id === current.rule_id && !skipped.has(v.entity_id),
    );
  }, [current, violations, skipped]);

  const enterBulk = () => {
    const ids = new Set(bulkCandidates.map(v => v.entity_id));
    setBulkSelected(ids);
    setBulkMode(true);
    setBulkPreview(null);
  };

  const handleBulkPreview = async (action: any) => {
    // Preview для одного — умножим визуально. Точнее — считаем на сервере по одному.
    // Для простоты: preview первого + показываем сумму.
    if (bulkSelected.size === 0) return;
    const firstId = Array.from(bulkSelected)[0];
    const first = violations.find(v => v.entity_id === firstId);
    if (!first) return;
    const res = await previewAction({ entity_id: firstId, action });
    setBulkPreview({ ...res, count: bulkSelected.size });
  };

  const handleBulkApply = async (action: any) => {
    if (bulkSelected.size === 0) return;
    if (!confirm(`Применить действие к ${bulkSelected.size} операциям?`)) return;

    setApplyLoading(true);
    try {
      const res = await applyBulk({
        entity_ids: Array.from(bulkSelected),
        action,
        rule_id: current.rule_id,
      });
      alert(`Применено: ${res.applied}. Ошибок: ${res.failed}.`);
      setBulkMode(false);
      await load();
      setIndex(0);
      resetForNext();
    } finally {
      setApplyLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (violations.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <h3 className="text-lg font-semibold text-green-900 mb-2">Нарушений нет</h3>
        <p className="text-green-700 mb-4">Все проверки пройдены.</p>
        <Link
          href="/settings/data-quality"
          className="text-sm text-green-700 hover:text-green-900 underline"
        >
          ← Вернуться к дашборду
        </Link>
      </div>
    );
  }

  if (activeViolations.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Все нарушения обработаны</h3>
        <p className="text-blue-700 mb-4">Пропущено: {skipped.size}</p>
        <button
          onClick={() => { setSkipped(new Set()); setIndex(0); }}
          className="text-sm text-blue-700 hover:text-blue-900 underline"
        >
          Начать заново
        </button>
      </div>
    );
  }

  if (bulkMode) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Массовое исправление: {bulkSelected.size} операций
            </h2>
            <p className="text-gray-500 mt-1">Правило: {current.rule_name}</p>
          </div>
          <button
            onClick={() => setBulkMode(false)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm"
          >
            ← Отмена
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Выберите операции:</p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {bulkCandidates.map((v: any) => (
              <label key={v.entity_id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkSelected.has(v.entity_id)}
                  onChange={(e) => {
                    const next = new Set(bulkSelected);
                    if (e.target.checked) next.add(v.entity_id);
                    else next.delete(v.entity_id);
                    setBulkSelected(next);
                  }}
                  className="rounded"
                />
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{v.entity.description}</p>
                  <p className="text-xs text-gray-500">
                    {v.entity.date?.split('T')[0]} — {fmtMoney(v.entity.amount_rub)}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Выберите действие:</p>
          <div className="space-y-2">
            {current.suggested_actions
              .filter((a: any) => !a.requires_input && !a.is_destructive)
              .map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.label}</p>
                    {a.description && <p className="text-xs text-gray-500">{a.description}</p>}
                  </div>
                  <button
                    onClick={() => handleBulkPreview(a)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Показать preview
                  </button>
                  <button
                    onClick={() => handleBulkApply(a)}
                    disabled={applyLoading || bulkSelected.size === 0}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    Применить
                  </button>
                </div>
              ))}
          </div>
        </div>

        {bulkPreview && <PreviewBlock preview={bulkPreview} count={bulkPreview.count} />}
      </div>
    );
  }

  return (
    <div>
      {/* Заголовок wizard */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/settings/data-quality" className="hover:text-gray-700">
              Качество данных
            </Link>
            <span>/</span>
            <span>Разбор нарушений</span>
          </div>
          <div className="text-sm text-gray-500">
            Проблема {index + 1} из {activeViolations.length}
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all"
            style={{ width: `${((index + 1) / activeViolations.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Карточка */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium border ${severityColor(current.severity)}`}>
            {severityLabel(current.severity)}
          </span>
          <span className="text-xs text-gray-500 mt-1">{current.rule_name}</span>
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-2">{current.problem}</h3>
        <p className="text-sm text-gray-600 mb-6">{current.explanation}</p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700">
            <span className="font-medium">Транзакция:</span>{' '}
            {current.entity.description || '(без описания)'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {current.entity.date?.split('T')[0]} — {fmtMoney(current.entity.amount_rub)}
          </p>
        </div>

        {/* Действия */}
        <p className="text-sm font-medium text-gray-700 mb-3">Что вы имели в виду?</p>
        <div className="space-y-2 mb-6">
          {current.suggested_actions.map((a: any) => (
            <div key={a.id}>
              <label
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedActionId === a.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  checked={selectedActionId === a.id}
                  onChange={() => handleSelectAction(a)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{a.label}</p>
                  {a.description && <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>}
                  {a.is_destructive && (
                    <p className="text-xs text-red-600 mt-1">⚠ Действие необратимо</p>
                  )}
                  {a.requires_input && selectedActionId === a.id && (
                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder={a.input_label || 'Значение'}
                      className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      autoFocus
                    />
                  )}
                </div>
              </label>
              {a.id === 'reassign' && bulkCandidates.length > 1 && selectedActionId === a.id && (
                <div className="ml-6 mt-2">
                  <button
                    onClick={enterBulk}
                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                  >
                    Найдено {bulkCandidates.length} похожих операций — применить ко всем →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Preview */}
        {selectedAction?.preview_capable && !selectedAction?.requires_input && (
          <div className="mb-6">
            {previewLoading ? (
              <p className="text-sm text-gray-500">Расчёт preview...</p>
            ) : preview?.success ? (
              <PreviewBlock preview={preview} />
            ) : preview?.error ? (
              <p className="text-sm text-red-600">Preview: {preview.error}</p>
            ) : null}
          </div>
        )}
      </div>

      {/* Кнопки */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button
            onClick={handleSkip}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Пропустить
          </button>
          <button
            onClick={handleSkipRule}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Пропустить все этого правила
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetForNext}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Сбросить
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedActionId || applyLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {applyLoading ? 'Применение...' : 'Применить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewBlock({ preview, count }: any) {
  if (!preview?.success) return null;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <p className="text-sm font-medium text-blue-900 mb-3">
        Что изменится {count ? `(для ${count} операций)` : ''}:
      </p>
      {preview.pnl_diff && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <DiffRow label="Выручка" value={preview.pnl_diff.revenue} />
          <DiffRow label="Себестоимость" value={preview.pnl_diff.cogs} />
          <DiffRow label="Операционные расходы" value={preview.pnl_diff.opex} />
          <DiffRow label="Налоги" value={preview.pnl_diff.taxes} />
          <DiffRow label="Чистая прибыль" value={preview.pnl_diff.net_profit} bold />
        </div>
      )}
      {preview.affected_accounts && preview.affected_accounts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <p className="text-xs font-medium text-blue-900 mb-1">Затронутые счета:</p>
          {preview.affected_accounts.map((a: any) => (
            <div key={a.account_id} className="flex justify-between text-xs text-blue-700">
              <span>{a.account_name}</span>
              <span className="font-medium">{fmtDiff(a.delta)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-blue-600 mt-3 italic">
        Это предпросмотр. Ничего не сохранено, пока вы не нажмёте «Применить».
      </p>
    </div>
  );
}

function DiffRow({ label, value, bold }: any) {
  const color = value > 0 ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gray-500';
  return (
    <div className="flex justify-between">
      <span className={bold ? 'font-medium text-gray-900' : 'text-gray-600'}>{label}:</span>
      <span className={`font-medium ${color}`}>{fmtDiff(value)}</span>
    </div>
  );
}
