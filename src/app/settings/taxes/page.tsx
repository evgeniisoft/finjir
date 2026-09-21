"use client";

import { useEffect, useState } from "react";

export default function TaxesSettingsPage() {
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/data?action=getAll&sheet=Settings", {
        credentials: "include",
      });
      const data = await response.json();
      setSettings(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Ошибка:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (setting: any) => {
    let newValue: any = editValue;

    // Для системных счетов — это строки
    if (setting.key.startsWith("system_account_")) {
      newValue = editValue.trim();
    } else {
      newValue = parseFloat(editValue.replace(",", "."));
      if (isNaN(newValue)) {
        alert("Введите число");
        return;
      }
    }

    // Если поле процентное — конвертируем в десятичную дробь
    if (isPercent(setting.key)) {
      newValue = newValue / 100;
    }
    if (isNaN(newValue)) {
      alert("Введите число");
      return;
    }

    try {
      setSaving(true);

      // Используем API Route как в планировании
      const response = await fetch("/api/data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          action: "update",
          sheet: "Settings",
          id: setting.id,
          data: {
            ...setting,
            value: String(newValue),
          },
        }),
      });

      const result = await response.json();

      if (result && !result.error) {
        setEditingId(null);
        loadSettings();
      } else {
        alert("Ошибка: " + (result?.error || "Не удалось сохранить"));
      }
    } catch (error) {
      console.error("Ошибка:", error);
      alert("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  const formatLabel = (key: string) => {
    const labels: { [key: string]: string } = {
      vat_osno: "НДС ОСНО",
      vat_osno_reduced: "НДС льготный",
      vat_usn_5: "НДС УСН 5%",
      vat_usn_7: "НДС УСН 7%",
      profit_tax: "Налог на прибыль",
      usn_6: "УСН Доходы",
      usn_15: "УСН Доходы-Расходы",
      usn_min_tax: "Минимальный налог УСН",
      usn_vat_exempt_limit: "Порог освобождения НДС",
      usn_vat_5_limit: "Порог 5%",
      usn_vat_7_limit: "Порог 7%",
      insurance_base_rate: "Базовая ставка",
      insurance_reduced_rate: "Пониженная ставка",
      insurance_msp_rate: "МСП льготная",
      insurance_it_rate: "IT ставка",
      insurance_limit: "Предельная база",
      mrot: "МРОТ",
      ndfl_base_rate: "НДФЛ базовая",
      ndfl_increased_rate: "НДФЛ повышенная",
      ndfl_limit: "Порог НДФЛ",
      ip_fixed_contribution: "Фиксированный взнос ИП",
      ip_additional_threshold: "Порог доп. взноса ИП",
      ip_additional_rate: "Доп. взнос %",
      ip_additional_max: "Макс. доп. взнос",
      // Системные счета
      system_account_bank: "Основной банк",
      system_account_ar: "Дебиторка",
      system_account_ap: "Кредиторка",
      system_account_equity: "Капитал",
      system_account_unclassified: "Некатегоризированное",
      system_account_fixed_assets: "Основные средства",
      system_account_revenue: "Выручка",

      // Сроки платежей
      vat_payment_day: "День уплаты НДС",
      usn_payment_day: "День уплаты УСН",
      insurance_payment_day: "День уплаты взносов",
      ndfl_payment_day: "День уплаты НДФЛ",

      // Пороги диагностики
      diagnostic_slow_warning: "Порог GAS warning (мс)",
      diagnostic_slow_critical: "Порог GAS critical (мс)",
      diagnostic_budget_warning: "Порог пустых бюджетов",
      diagnostic_warning_threshold: "Порог warning %",
      diagnostic_critical_threshold: "Порог critical %",
      diagnostic_run_rate_deviation: "Отклонение Run Rate %",
      diagnostic_budget_deviations: "Отклонения бюджета",
      diagnostic_ar_warning: "Порог дебиторки ₽",
      diagnostic_ap_warning: "Порог кредиторки ₽",
      diagnostic_stale_warning: "Устаревание (дней)",
      diagnostic_stale_info: "Инфо (дней)",
      diagnostic_consistency_threshold: "Порог расхождений ₽",
    };
    return labels[key] || key;
  };

  const isPercent = (key: string) => {
    // Проценты только для ставок
    const percentKeys = [
      "vat_osno",
      "vat_osno_reduced",
      "vat_usn_5",
      "vat_usn_7",
      "profit_tax",
      "usn_6",
      "usn_15",
      "usn_min_tax",
      "insurance_base_rate",
      "insurance_reduced_rate",
      "insurance_msp_rate",
      "insurance_it_rate",
      "ndfl_base_rate",
      "ndfl_increased_rate",
      "ip_additional_rate",
    ];

    return percentKeys.includes(key);
  };

  const displayValue = (setting: any) => {
    const value = parseFloat(setting.value);
    if (isNaN(value)) {
      return String(setting.value);
    }
    if (isPercent(setting.key)) {
      return (value * 100).toFixed(value < 0.1 ? 1 : 0) + "%";
    }
    return value.toLocaleString("ru-RU");
  };

  const getInputValue = (setting: any) => {
    const value = parseFloat(setting.value);
    if (isNaN(value)) {
      return String(setting.value);
    }
    if (isPercent(setting.key)) {
      return String(value * 100);
    }
    return String(value);
  };

  if (loading) {
    return <div className="text-center py-12">Загрузка...</div>;
  }

  const groups = [
    { title: "Налоговые ставки", category: "taxes" },
    { title: "Лимиты УСН", category: "limits" },
    { title: "Страховые взносы", category: "insurance" },
    { title: "НДФЛ", category: "ndfl" },
    { title: "Взносы ИП", category: "ip" },
    { title: "Системные счета", category: "system" },
    { title: "Сроки платежей", category: "deadlines" },
    { title: "Пороги диагностики", category: "diagnostics" },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Налоговые параметры
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {groups.map((group) => {
          const groupSettings = settings.filter(
            (s) => s.category === group.category,
          );
          if (groupSettings.length === 0) return null;

          return (
            <div
              key={group.category}
              className="bg-white rounded-xl border border-gray-200 p-6"
            >
              <h3 className="font-semibold text-gray-900 mb-4">
                {group.title}
              </h3>
              {groupSettings.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <span className="text-sm text-gray-600">
                    {formatLabel(s.key)}
                  </span>

                  {editingId === s.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-28 px-2 py-1 border border-blue-500 rounded text-right"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSave(s);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      {isPercent(s.key) && (
                        <span className="text-xs text-gray-400">%</span>
                      )}
                      <button
                        onClick={() => handleSave(s)}
                        disabled={saving}
                        className="p-1 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        {saving ? "..." : "✓"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(s.id);
                        setEditValue(getInputValue(s));
                      }}
                      className="text-sm font-medium cursor-pointer hover:text-blue-600 hover:underline"
                    >
                      {displayValue(s)}
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Нажмите на значение, чтобы изменить. Enter — сохранить, Esc — отмена.
      </p>
    </div>
  );
}
