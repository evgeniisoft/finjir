"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function FixedAssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [deletingAsset, setDeletingAsset] = useState<any>(null);

  const [form, setForm] = useState({
    company_id: "",
    name: "",
    inventory_number: "",
    asset_group: "",
    depreciation_group: "",
    initial_cost: "",
    salvage_value: "0",
    commissioning_date: "",
    useful_life_months: "60",
    depreciation_method: "straight_line",
    status: "active",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assetsRes, companiesData] = await Promise.all([
        fetch("/api/fixed-assets", { credentials: "include" }).then((r) => r.json()),
        api.getAll("Companies"),
      ]);
      setAssets(Array.isArray(assetsRes) ? assetsRes : []);
      setCompanies(companiesData);
    } catch (e) {
      console.error(e);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      company_id: "",
      name: "",
      inventory_number: "",
      asset_group: "",
      depreciation_group: "",
      initial_cost: "",
      salvage_value: "0",
      commissioning_date: "",
      useful_life_months: "60",
      depreciation_method: "straight_line",
      status: "active",
    });
    setEditingAsset(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (asset: any) => {
    setForm({
      company_id: asset.company_id || "",
      name: asset.name || "",
      inventory_number: asset.inventory_number || "",
      asset_group: asset.asset_group || "",
      depreciation_group: asset.depreciation_group ? String(asset.depreciation_group) : "",
      initial_cost: String(asset.initial_cost || ""),
      salvage_value: String(asset.salvage_value || "0"),
      commissioning_date: asset.commissioning_date
        ? String(asset.commissioning_date).split("T")[0]
        : "",
      useful_life_months: String(asset.useful_life_months || "60"),
      depreciation_method: asset.depreciation_method || "straight_line",
      status: asset.status || "active",
    });
    setEditingAsset(asset);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      alert("Введите наименование");
      return;
    }
    if (!form.company_id) {
      alert("Выберите компанию");
      return;
    }
    if (!form.initial_cost || Number(form.initial_cost) <= 0) {
      alert("Введите первоначальную стоимость");
      return;
    }
    if (!form.commissioning_date) {
      alert("Введите дату ввода в эксплуатацию");
      return;
    }
    if (!form.useful_life_months || Number(form.useful_life_months) <= 0) {
      alert("Введите срок полезного использования");
      return;
    }

    try {
      const payload = {
        company_id: form.company_id,
        name: form.name,
        inventory_number: form.inventory_number,
        asset_group: form.asset_group,
        depreciation_group: form.depreciation_group ? Number(form.depreciation_group) : null,
        initial_cost: Number(form.initial_cost),
        salvage_value: Number(form.salvage_value || 0),
        commissioning_date: form.commissioning_date,
        useful_life_months: Number(form.useful_life_months),
        depreciation_method: form.depreciation_method,
        status: form.status,
      };

      if (editingAsset) {
        const res = await fetch(`/api/fixed-assets/${editingAsset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ошибка обновления");
      } else {
        const res = await fetch("/api/fixed-assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ошибка создания");
      }

      setShowForm(false);
      resetForm();
      await loadData();
    } catch (e: any) {
      alert("Ошибка: " + e.message);
    }
  };

  const handleDelete = async () => {
    if (!deletingAsset) return;
    try {
      const res = await fetch(`/api/fixed-assets/${deletingAsset.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка удаления");
      setDeletingAsset(null);
      await loadData();
    } catch (e: any) {
      alert("Ошибка: " + e.message);
    }
  };

  const handleGenerate = async (apply: boolean) => {
    try {
      setGenerating(true);
      const res = await fetch("/api/admin/generate-depreciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          apply,
          start_year: new Date().getFullYear(),
          end_year: new Date().getFullYear() + 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      setGenResult(data);
      if (apply && data.created > 0) {
        await loadData();
      }
    } catch (e: any) {
      alert("Ошибка: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const formatMoney = (n: number) =>
    Math.round(n || 0).toLocaleString("ru-RU") + " ₽";

  const formatDate = (d: string) => {
    if (!d) return "—";
    return String(d).split("T")[0].split("-").reverse().join(".");
  };

  const getCompanyName = (id: string) =>
    companies.find((c) => c.id === id)?.name || id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Основные средства</h2>
          <p className="text-gray-500 mt-1">
            Справочник ОС и генерация амортизации
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleGenerate(false)}
            disabled={generating || assets.length === 0}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            {generating ? "Генерация..." : "Проверить план"}
          </button>
          <button
            onClick={() => handleGenerate(true)}
            disabled={generating || assets.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {generating ? "Генерация..." : "Сгенерировать план"}
          </button>
          <button
            onClick={openCreate}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            + Добавить ОС
          </button>
        </div>
      </div>

      {/* Результат генерации */}
      {genResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">
                {genResult.applied ? "Создано" : "Найдено"} {genResult.summary?.total || 0} транзакций
                {" "}(fact: {genResult.summary?.fact || 0}, plan: {genResult.summary?.plan || 0})
              </p>
              {genResult.summary?.total > 0 && (
                <p className="text-xs text-blue-700 mt-1">
                  Сумма: {formatMoney(
                    Object.values(genResult.summary?.by_company || {}).reduce(
                      (s: number, v: any) => s + (v.amount || 0),
                      0,
                    ),
                  )}
                </p>
              )}
              {genResult.created > 0 && (
                <p className="text-xs text-green-700 mt-1">
                  ✓ Создано записей: {genResult.created}
                </p>
              )}
            </div>
            <button
              onClick={() => setGenResult(null)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Форма создания/редактирования */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">
            {editingAsset ? "Редактирование ОС" : "Новое ОС"}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Компания *
              </label>
              <select
                value={form.company_id}
                onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={!!editingAsset}
              >
                <option value="">Выберите компанию</option>
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Наименование *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Например: Станок токарный"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Инвентарный номер
              </label>
              <input
                type="text"
                value={form.inventory_number}
                onChange={(e) =>
                  setForm({ ...form, inventory_number: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Группа ОС
              </label>
              <input
                type="text"
                value={form.asset_group}
                onChange={(e) => setForm({ ...form, asset_group: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Машины и оборудование"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Амортизационная группа
              </label>
              <input
                type="number"
                value={form.depreciation_group}
                onChange={(e) =>
                  setForm({ ...form, depreciation_group: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="1–10"
                min="1"
                max="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Статус
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="active">В эксплуатации</option>
                <option value="suspended">На консервации</option>
                <option value="disposed">Выбыло</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Первоначальная стоимость *
              </label>
              <input
                type="number"
                value={form.initial_cost}
                onChange={(e) => setForm({ ...form, initial_cost: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="45000000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ликвидационная стоимость
              </label>
              <input
                type="number"
                value={form.salvage_value}
                onChange={(e) => setForm({ ...form, salvage_value: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата ввода в эксплуатацию *
              </label>
              <input
                type="date"
                value={form.commissioning_date}
                onChange={(e) =>
                  setForm({ ...form, commissioning_date: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Срок полезного использования (мес) *
              </label>
              <input
                type="number"
                value={form.useful_life_months}
                onChange={(e) =>
                  setForm({ ...form, useful_life_months: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="60"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Метод амортизации
              </label>
              <select
                value={form.depreciation_method}
                onChange={(e) =>
                  setForm({ ...form, depreciation_method: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="straight_line">Линейный</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              {editingAsset ? "Сохранить" : "Создать"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Таблица ОС */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Загрузка...</div>
        ) : assets.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            Нет основных средств. Добавьте первое.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Наименование
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                    Компания
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                    Стоимость
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                    Дата ввода
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                    Срок, мес
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                    Статус
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {assets.map((a: any) => (
                  <tr
                    key={a.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/settings/fixed-assets/${a.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-blue-600 hover:text-blue-800">
                        {a.name}
                      </div>
                      {a.inventory_number && (
                        <div className="text-xs text-gray-500">
                          Инв. №: {a.inventory_number}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {getCompanyName(a.company_id)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {formatMoney(a.initial_cost)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-center">
                      {formatDate(a.commissioning_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-center">
                      {a.useful_life_months}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          a.status === "active"
                            ? "bg-green-100 text-green-700"
                            : a.status === "suspended"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {a.status === "active"
                          ? "В эксплуатации"
                          : a.status === "suspended"
                          ? "На консервации"
                          : "Выбыло"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(a);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Изменить
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingAsset(a);
                          }}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модалка удаления */}
      {deletingAsset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Удалить ОС?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Основное средство «{deletingAsset.name}» будет помечено как удалённое.
              Существующие транзакции амортизации останутся.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingAsset(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                Отмена
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
