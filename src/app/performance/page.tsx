"use client";

import { useEffect, useState } from "react";

export default function PerformancePage() {
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const runTest = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/performance");
      const data = await response.json();
      setTestResult(data);

      // Сохраняем в историю
      const newHistory = [
        ...history,
        { ...data, timestamp: new Date().toISOString() },
      ];
      setHistory(newHistory);
      localStorage.setItem("performance_history", JSON.stringify(newHistory));
    } catch (error) {
      console.error("Ошибка теста:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Загружаем историю
    const saved = localStorage.getItem("performance_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Фильтруем записи без summary (старый формат до правок)
        const valid = Array.isArray(parsed)
          ? parsed.filter(
              (h: any) => h && h.summary && h.summary.total_time_ms != null,
            )
          : [];
        setHistory(valid);
        // Заодно перезапишем localStorage очищенной версией
        if (valid.length !== parsed.length) {
          localStorage.setItem("performance_history", JSON.stringify(valid));
        }
      } catch {}
    }
  }, []);

  const getRussianName = (name: string) => {
    const map: { [key: string]: string } = {
      // Листы
      Companies: "Компании",
      Accounts: "Счета",
      Transactions: "Операции",
      Settings: "Настройки",
      Budgets: "Бюджеты",
      Counterparties: "Контрагенты",
      ExchangeRates: "Курсы валют",
      JournalEntries: "Проводки",
      // Этапы
      "Все листы параллельно": "Все листы (параллельно)",
      // Отчёты
      "ОПиУ (P&L)": "ОПиУ",
      "ДДС (Cash Flow)": "ДДС",
      Баланс: "Баланс",
    };
    return map[name] || name;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "critical":
        return "text-red-600";
      case "warning":
        return "text-yellow-600";
      default:
        return "text-green-600";
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">
          Производительность системы
        </h2>
        <p className="text-gray-500 mt-1">
          Тест загрузки данных и расчёта отчётов
        </p>
      </div>

      <button
        onClick={runTest}
        disabled={loading}
        className="mb-6 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Тестирование..." : "Запустить тест"}
      </button>

      {testResult && testResult.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
          <h3 className="font-semibold text-red-700 mb-2">Ошибка теста</h3>
          <p className="text-sm text-red-600 font-mono whitespace-pre-wrap">
            {testResult.error}
          </p>
          {testResult.stack && (
            <details className="mt-3">
              <summary className="text-xs text-red-500 cursor-pointer">
                Стек
              </summary>
              <pre className="text-xs text-red-400 mt-2 whitespace-pre-wrap">
                {testResult.stack}
              </pre>
            </details>
          )}
        </div>
      )}

      {testResult && testResult.summary && (
        <div className="space-y-6">
          {/* Итог */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Итог теста</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">
                  Реальное время (параллельно)
                </p>
                <p className="text-2xl font-bold">
                  {testResult.summary.parallel_time_ms ??
                    testResult.summary.total_time_ms ??
                    0}
                  мс
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Сумма всех запросов</p>
                <p className="text-lg font-semibold text-gray-500">
                  {testResult.summary.total_time_ms}мс
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Самый медленный</p>
                <p className="text-lg font-semibold text-red-600">
                  {getRussianName(testResult.summary.slowest.name)} (
                  {testResult.summary.slowest.time_ms}мс)
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Источник данных</p>
                <p className="text-lg font-semibold text-gray-900">
                  {testResult.data_source.type === "gas"
                    ? "Google Sheets (GAS)"
                    : "PostgreSQL"}
                </p>
              </div>
            </div>
          </div>

          {/* Детализация */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Детализация</h3>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Этап
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    Записей
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    Время
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    Статус
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {testResult.results.map((result: any, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-900">
                      {getRussianName(result.name)}
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-gray-500">
                      {result.rows || "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-medium">
                      {result.time_ms}мс
                    </td>
                    <td
                      className={`px-6 py-3 text-sm text-right font-medium ${getStatusColor(result.status)}`}
                    >
                      {result.status === "critical"
                        ? "Критично"
                        : result.status === "warning"
                          ? "Медленно"
                          : "ОК"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Рекомендации */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="font-semibold text-blue-700 mb-3">Рекомендации</h3>
            <ul className="space-y-2">
              {testResult.summary.recommendations.map(
                (rec: string, idx: number) => (
                  <li key={idx} className="text-sm text-blue-600">
                    • {rec}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      )}

      {/* История */}
      {history.length > 1 && (
        <div className="mt-8">
          <h3 className="font-semibold text-gray-900 mb-3">История тестов</h3>
          <div className="space-y-2">
            {history
              .slice(-5)
              .reverse()
              .filter((h: any) => h && h.summary)
              .map((h: any, idx: number) => (
                <div
                  key={idx}
                  onClick={() => setTestResult(h)}
                  className="bg-white rounded-lg border border-gray-200 p-3 flex justify-between cursor-pointer hover:bg-gray-50"
                >
                  <span className="text-sm text-gray-500">
                    {new Date(h.timestamp).toLocaleString("ru-RU")}
                  </span>
                  <span className="text-sm font-medium">
                    {h.summary.total_time_ms}мс
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
