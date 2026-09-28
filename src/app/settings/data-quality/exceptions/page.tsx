'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchExceptions,
  deleteException,
  fetchRules,
} from '@/lib/data-quality/client';

export default function ExceptionsPage() {
  const [loading, setLoading] = useState(true);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [e, r] = await Promise.all([fetchExceptions(), fetchRules()]);
      setExceptions(e);
      setRules(r);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: any) => {
    if (!confirm('Вернуть в проверки?')) return;
    await deleteException(e.id);
    await load();
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  const rulesMap = new Map(rules.map((r: any) => [r.id, r]));

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/settings/data-quality" className="hover:text-gray-700">Качество данных</Link>
          <span>/</span>
          <span>Исключения</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Исключения из проверок</h2>
        <p className="text-gray-500 mt-1">
          Операции, которые не должны проверяться по правилам.
        </p>
      </div>

      {exceptions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500">Исключений нет.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Правило</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Транзакция</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Причина</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Создано</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {exceptions.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {rulesMap.get(e.rule_id)?.name || e.rule_id}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">
                    {e.entity_type} / {e.entity_id.substring(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{e.reason || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {e.created_at ? new Date(e.created_at).toLocaleDateString('ru-RU') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(e)}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Вернуть в проверки
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
