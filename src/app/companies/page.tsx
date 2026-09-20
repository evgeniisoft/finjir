"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    tax_system: "USN_6",
    currency: "RUB",
    is_group: false,
    parent_id: "",
    inn: "",
    kpp: "",
    external_id: "",
    source: "manual",
  });

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const data = await api.getAll("Companies");
      setCompanies(data);
      setError(null);
    } catch (err) {
      setError("Ошибка при загрузке компаний");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      // Авто-простановка vat_* по tax_system
      const taxSystem = formData.tax_system;
      const vatFields =
        taxSystem === "OSNO"
          ? { vat_included: true, vat_rate: 0.22, vat_exempt: false }
          : { vat_included: false, vat_rate: 0, vat_exempt: true };

      const newCompany = {
        name: formData.name,
        tax_system: formData.tax_system,
        currency: formData.currency,
        is_group: formData.is_group,
        parent_id: formData.parent_id,
        inn: formData.inn,
        kpp: formData.kpp,
        external_id: formData.external_id,
        source: formData.source,
        ...vatFields,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };

      await api.create("Companies", newCompany);
      setShowForm(false);
      resetForm();
      loadCompanies();
    } catch (err) {
      setError("Ошибка при создании компании");
      console.error(err);
    }
  };

  const handleUpdate = async () => {
    if (!editingCompany) return;

    try {
      const taxSystem = formData.tax_system;
      const vatFields =
        taxSystem === "OSNO"
          ? { vat_included: true, vat_rate: 0.22, vat_exempt: false }
          : { vat_included: false, vat_rate: 0, vat_exempt: true };

      await api.update("Companies", editingCompany.id, {
        ...formData,
        ...vatFields,
      });
      setShowForm(false);
      setEditingCompany(null);
      resetForm();
      loadCompanies();
    } catch (err) {
      setError("Ошибка при обновлении компании");
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить компанию?")) return;

    try {
      await api.delete("Companies", id);
      loadCompanies();
    } catch (err) {
      setError("Ошибка при удалении компании");
      console.error(err);
    }
  };

  const handleEdit = (company: any) => {
    setEditingCompany(company);
    setFormData({
      name: company.name || "",
      tax_system: company.tax_system || "USN_6",
      currency: company.currency || "RUB",
      is_group: company.is_group === true || company.is_group === "true",
      parent_id: company.parent_id || "",
      inn: company.inn || "",
      kpp: company.kpp || "",
      external_id: company.external_id || "",
      source: company.source || "manual",
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      tax_system: "USN_6",
      currency: "RUB",
      is_group: false,
      parent_id: "",
      inn: "",
      kpp: "",
      external_id: "",
      source: "manual",
    });
    setEditingCompany(null);
  };

  return (
    <div>
      {/* Заголовок */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Компании</h2>
          <p className="text-gray-500 mt-1">
            Управление юридическими лицами холдинга
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-all shadow-sm hover:shadow-md cursor-pointer"
        >
          + Добавить компанию
        </button>
      </div>

      {/* Форма создания/редактирования */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingCompany ? "Редактировать компанию" : "Новая компания"}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Название
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                placeholder="ООО «Ромашка»"
              />
            </div>
            {/* Новые поля */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ИНН
              </label>
              <input
                type="text"
                value={formData.inn}
                onChange={(e) =>
                  setFormData({ ...formData, inn: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="7701234567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                КПП
              </label>
              <input
                type="text"
                value={formData.kpp}
                onChange={(e) =>
                  setFormData({ ...formData, kpp: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="770101001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Внешний ID (из 1С)
              </label>
              <input
                type="text"
                value={formData.external_id}
                onChange={(e) =>
                  setFormData({ ...formData, external_id: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="GUID из 1С"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Источник
              </label>
              <select
                value={formData.source}
                onChange={(e) =>
                  setFormData({ ...formData, source: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="manual">Вручную</option>
                <option value="1c">Импорт из 1С</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Система налогообложения
              </label>
              <select
                value={formData.tax_system}
                onChange={(e) =>
                  setFormData({ ...formData, tax_system: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 cursor-pointer"
              >
                <option value="USN_6">УСН 6%</option>
                <option value="USN_15">УСН 15%</option>
                <option value="OSNO">ОСНО</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Валюта учёта
              </label>
              <select
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 cursor-pointer"
              >
                <option value="RUB">₽ Рубль</option>
                <option value="USD">$ Доллар</option>
                <option value="EUR">€ Евро</option>
                <option value="CNY">¥ Юань</option>
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_group}
                onChange={(e) =>
                  setFormData({ ...formData, is_group: e.target.checked })
                }
                className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label className="text-sm font-medium text-gray-700 cursor-pointer">
                Головная компания холдинга
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={editingCompany ? handleUpdate : handleCreate}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-all shadow-sm hover:shadow-md cursor-pointer"
              >
                {editingCompany ? "Сохранить изменения" : "Создать компанию"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 active:bg-gray-300 transition-all cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Состояние загрузки */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      )}

      {/* Ошибка */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Таблица компаний */}
      {!loading && !error && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Название
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  СНО
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Валюта
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {companies.map((company) => (
                <tr
                  key={company.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {company.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {company.tax_system === "USN_6" && "УСН 6%"}
                    {company.tax_system === "USN_15" && "УСН 15%"}
                    {company.tax_system === "OSNO" && "ОСНО"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {company.currency}
                  </td>
                  <td className="px-6 py-4">
                    {company.is_group ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Холдинг
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Дочерняя
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      onClick={() => handleEdit(company)}
                      className="text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium transition-colors cursor-pointer"
                    >
                      Изменить
                    </button>
                    <button
                      onClick={() => handleDelete(company.id)}
                      className="text-red-600 hover:text-red-800 hover:underline text-sm font-medium transition-colors cursor-pointer"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {companies.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">Компании не найдены</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
