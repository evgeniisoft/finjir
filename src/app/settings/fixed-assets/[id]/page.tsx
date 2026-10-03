"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function FixedAssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asOfDate, setAsOfDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  useEffect(() => {
    if (assetId) loadData();
  }, [assetId, asOfDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/fixed-assets/${assetId}/depreciation?as_of=${asOfDate}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка загрузки");
      }
      const d = await res.json();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (n: number) =>
    Math.round(n || 0).toLocaleString("ru-RU") + " ₽";

  const formatDate = (d: string) => {
    if (!d) return "—";
    return String(d).split("T")[0].split("-").reverse().join(".");
  };

  const formatMonth = (ym: string) => {
    if (!ym) return "—";
    const [y, m] = ym.split("-");
    const months = [
      "янв",
      "фев",
      "мар",
      "апр",
      "май",
      "июн",
      "июл",
      "авг",
      "сен",
      "окт",
      "ноя",
      "дек",
    ];
    return `${months[parseInt(m) - 1]} ${y}`;
  };

  if (loading) {
    return <div className="p-12 text-center text-gray-500">Загрузка...</div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/settings/fixed-assets")}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          ← Назад к списку ОС
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          Ошибка: {error}
        </div>
      </div>
    );
  }

  const { asset, summary, schedule, transactions } = data;

  return (
    <div className="space-y-6">
      {/* Хлебные крошки */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => router.push("/settings/fixed-assets")}
          className="text-blue-600 hover:text-blue-800"
        >
          ← Назад к списку ОС
        </button>
      </div>

      {/* Шапка */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{asset.name}</h2>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
              {asset.inventory_number && (
                <span>Инв. № {asset.inventory_number}</span>
              )}
              {asset.asset_group && <span>· {asset.asset_group}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">На дату:</label>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            <span
              className={`inline-block px-3 py-1 rounded text-sm font-medium ${
                asset.status === "active"
                  ? "bg-green-100 text-green-700"
                  : asset.status === "suspended"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-700"
              }`}
            >
              {asset.status === "active"
                ? "В эксплуатации"
                : asset.status === "suspended"
                  ? "На консервации"
                  : "Выбыло"}
            </span>
          </div>
        </div>

        {/* Ключевые цифры */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase mb-1">
              Первоначальная
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {formatMoney(summary.initial_cost)}
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-xs text-blue-600 uppercase mb-1">
              Накопленная
            </div>
            <div className="text-lg font-semibold text-blue-700">
              {formatMoney(summary.accumulated)}
            </div>
            <div className="text-xs text-blue-500 mt-1">
              на {formatDate(asOfDate)} · {summary.months_elapsed} из{" "}
              {summary.months_total} мес
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-xs text-green-600 uppercase mb-1">
              Остаточная
            </div>
            <div className="text-lg font-semibold text-green-700">
              {formatMoney(summary.residual)}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase mb-1">В месяц</div>
            <div className="text-lg font-semibold text-gray-900">
              {formatMoney(summary.monthly_amount)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              осталось {summary.months_remaining} мес
            </div>
          </div>
        </div>

        {/* Параметры */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100 text-sm">
          <div>
            <div className="text-gray-500">Дата ввода</div>
            <div className="font-medium text-gray-900">
              {formatDate(asset.commissioning_date)}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Срок полезного использования</div>
            <div className="font-medium text-gray-900">
              {asset.useful_life_months} мес
            </div>
          </div>
          <div>
            <div className="text-gray-500">Метод амортизации</div>
            <div className="font-medium text-gray-900">
              {asset.depreciation_method === "straight_line"
                ? "Линейный"
                : asset.depreciation_method}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Ликвидационная стоимость</div>
            <div className="font-medium text-gray-900">
              {formatMoney(summary.salvage_value)}
            </div>
          </div>
        </div>
      </div>

      {/* График амортизации */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            График амортизации
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Всего {schedule.length} месяцев
          </p>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                  Месяц
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                  Сумма
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                  Накопленная
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                  Остаточная
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                  Статус
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {schedule.map((row: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {formatMonth(row.period)}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900">
                    {formatMoney(row.amount)}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-600">
                    {formatMoney(row.accumulated)}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-600">
                    {formatMoney(row.residual)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {row.record_type === "fact" ? (
                      <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                        Факт
                      </span>
                    ) : row.record_type === "plan" ? (
                      <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                        План
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                        Нет
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Связанные транзакции */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            Транзакции амортизации
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {transactions.length} записей в базе
          </p>
        </div>
        {transactions.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            Нет связанных транзакций
          </div>
        ) : (
          <div className="overflow-x-auto max-h-80">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Дата
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Описание
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    Сумма
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                    Тип
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Источник
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {transactions.map((t: any) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {formatDate(t.date)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {t.description}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900">
                      {formatMoney(t.amount)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs rounded ${
                          t.record_type === "fact"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {t.record_type === "fact" ? "Факт" : "План"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {t.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
