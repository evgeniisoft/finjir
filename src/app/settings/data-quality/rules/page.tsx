'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchRules,
  deleteRule,
  createRule,
  updateRule,
  seedRules,
  severityLabel,
  severityColor,
} from '@/lib/data-quality/client';
import RuleEditor from './rule-editor';

export default function RulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [rulesData, accountsRes] = await Promise.all([
        fetchRules(),
        fetch('/api/data?action=getAll&sheet=Accounts').then(r => r.json()),
      ]);
      setRules(rulesData);
      setAccounts(Array.isArray(accountsRes) ? accountsRes : []);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (rule: any) => {
    if (!confirm(`Удалить правило «${rule.name}»?`)) return;
    await deleteRule(rule.id);
    await load();
  };

  const handleToggle = async (rule: any) => {
    await updateRule(rule.id, { is_active: !rule.is_active });
    await load();
  };

  const handleSave = async (data: any) => {
    if (editing && editing.id) {
      await updateRule(editing.id, data);
    } else {
      await createRule(data);
    }
    setEditing(null);
    setCreating(false);
    await load();
  };

  const handleSeed = async () => {
    if (!confirm('Загрузить базовые правила? Существующие с такими же названиями будут пропущены.')) return;
    const res = await seedRules();
    alert(`Создано: ${res.created}. Пропущено: ${res.skipped}.`);
    await load();
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/settings/data-quality" className="hover:text-gray-700">
              Качество данных
            </Link>
            <span>/</span>
            <span>Правила</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Правила проверки</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSeed}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
          >
            Загрузить базовые
          </button>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + Добавить правило
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500 mb-4">Правил пока нет.</p>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Создать первое правило
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Активно</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Название</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Тип</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Условие</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Severity</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(rule)}
                      className={`w-10 h-5 rounded-full transition-colors ${rule.is_active ? 'bg-blue-600' : 'bg-gray-300'} relative`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${rule.is_active ? 'translate-x-5' : ''}`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{rule.name}</p>
                    {rule.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600 font-mono">
                      {rule.rule_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {rule.condition?.debit_account_id || rule.condition?.debit_account_id_like || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium border ${severityColor(rule.severity)}`}>
                      {severityLabel(rule.severity)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditing(rule)}
                      className="text-xs text-blue-600 hover:text-blue-700 mr-3"
                    >
                      Изменить
                    </button>
                    <button
                      onClick={() => handleDelete(rule)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <RuleEditor
          rule={editing}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setCreating(false); }}
          accounts={accounts}
        />
      )}
    </div>
  );
}
