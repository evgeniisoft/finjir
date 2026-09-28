'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchRules,
  fetchExceptions,
  runChecks,
  seedRules,
  severityColor,
  severityLabel,
  fmtMoney,
} from '@/lib/data-quality/client';

export default function DataQualityDashboard() {
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [rules, setRules] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [r, e, run] = await Promise.all([
        fetchRules(),
        fetchExceptions(),
        runChecks(),
      ]);
      setRules(r);
      setExceptions(e);
      setViolations(run.violations || []);
      setSummary(run.summary || null);
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    if (!confirm('Загрузить базовые правила? Уже существующие с такими же названиями будут пропущены.')) return;
    setSeeding(true);
    try {
      const res = await seedRules();
      alert(`Создано правил: ${res.created}. Пропущено: ${res.skipped}.`);
      await load();
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  const totalRules = rules.length;
  const activeRules = rules.filter(r => r.is_active).length;
  const totalViolations = violations.length;
  const critical = violations.filter(v => v.severity === 'critical').length;
  const warnings = violations.filter(v => v.severity === 'warning').length;
  const infos = violations.filter(v => v.severity === 'info').length;
  const health = totalRules === 0 ? 100 : Math.max(0, 100 - Math.min(100, Math.round((critical * 20 + warnings * 5 + infos * 1) / Math.max(1, totalRules) * 10)));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Качество данных</h2>
          <p className="text-gray-500 mt-1">
            Проверка соответствия операций правилам холдинга
          </p>
        </div>
        <div className="flex gap-2">
          {rules.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              {seeding ? 'Загрузка...' : 'Загрузить базовые правила'}
            </button>
          )}
          <Link
            href="/settings/data-quality/rules"
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Управление правилами
          </Link>
          {totalViolations > 0 && (
            <Link
              href="/settings/data-quality/review"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Разобрать нарушения ({totalViolations})
            </Link>
          )}
        </div>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Правил" value={totalRules} sub={`${activeRules} активных`} />
        <StatCard
          label="Нарушений"
          value={totalViolations}
          sub={`${critical} критичных, ${warnings} warning`}
          accent={critical > 0 ? 'red' : warnings > 0 ? 'yellow' : 'green'}
        />
        <StatCard label="Исключений" value={exceptions.length} sub="из проверок" />
        <StatCard
          label="Здоровье"
          value={`${health}%`}
          sub={health >= 90 ? 'Отлично' : health >= 70 ? 'Внимание' : 'Проблемы'}
          accent={health >= 90 ? 'green' : health >= 70 ? 'yellow' : 'red'}
        />
      </div>

      {rules.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Правила не настроены</h3>
          <p className="text-blue-700 mb-4">
            Нажмите «Загрузить базовые правила», чтобы начать — или создайте свои через «Управление правилами».
          </p>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {seeding ? 'Загрузка...' : 'Загрузить базовые правила'}
          </button>
        </div>
      ) : (
        <>
          {totalViolations === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <h3 className="text-lg font-semibold text-green-900 mb-2">
                Все проверки пройдены
              </h3>
              <p className="text-green-700">
                Нарушений не обнаружено. Система здорова.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  Последние нарушения (первые 10)
                </h3>
                <Link
                  href="/settings/data-quality/review"
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Разобрать все →
                </Link>
              </div>
              <div className="divide-y divide-gray-100">
                {violations.slice(0, 10).map((v, i) => (
                  <div key={i} className="px-6 py-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {v.entity.description || '(без описания)'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {v.entity.date?.split('T')[0]} — {v.problem}
                      </p>
                    </div>
                    <span className={`ml-4 inline-flex px-2 py-1 rounded-md text-xs font-medium border ${severityColor(v.severity)}`}>
                      {severityLabel(v.severity)}
                    </span>
                  </div>
                ))}
              </div>
              {violations.length > 10 && (
                <div className="px-6 py-3 bg-gray-50 text-sm text-gray-500 text-center">
                  и ещё {violations.length - 10}...
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent = 'gray' }: any) {
  const accentClasses: any = {
    red: 'text-red-600',
    yellow: 'text-yellow-600',
    green: 'text-green-600',
    gray: 'text-gray-900',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accentClasses[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
