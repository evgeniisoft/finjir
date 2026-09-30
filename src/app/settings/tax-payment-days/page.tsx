'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  TAX_TYPES,
  TaxType,
  taxPaymentDayKey,
  DEFAULT_PAYMENT_DAY,
  validatePaymentDay,
} from '@/lib/utils/tax-payment-days';

export default function TaxPaymentDaysPage() {
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState<Record<TaxType, number>>({
    vat: DEFAULT_PAYMENT_DAY,
    usn: DEFAULT_PAYMENT_DAY,
    profit: DEFAULT_PAYMENT_DAY,
    insurance: DEFAULT_PAYMENT_DAY,
    ndfl: DEFAULT_PAYMENT_DAY,
    ip_fixed: DEFAULT_PAYMENT_DAY,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const settingsData = await api.getAll('Settings');
      const settingsArr = Array.isArray(settingsData) ? settingsData : [];
      setSettings(settingsArr);

      const loaded: Record<TaxType, number> = { ...days };
      for (const t of TAX_TYPES) {
        const key = taxPaymentDayKey(t.key);
        const setting = settingsArr.find((s: any) => s.key === key);
        if (setting) {
          const val = parseInt(String(setting.value || ''), 10);
          if (!isNaN(val) && val >= 1 && val <= 31) {
            loaded[t.key] = val;
          }
        }
      }
      setDays(loaded);
    } catch (e) {
      console.error('Ошибка загрузки настроек:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Валидация
    for (const t of TAX_TYPES) {
      const v = validatePaymentDay(days[t.key]);
      if (!v.valid) {
        alert(`«${t.label}»: ${v.error}`);
        return;
      }
    }

    try {
      setSaving(true);

      for (const t of TAX_TYPES) {
        const key = taxPaymentDayKey(t.key);
        const value = String(days[t.key]);
        const existing = settings.find((s: any) => s.key === key);

        if (existing) {
          if (String(existing.value) !== value) {
            await api.update('Settings', existing.id, { value });
          }
        } else {
          await api.create('Settings', {
            key,
            value,
            description: `День уплаты: ${t.label}`,
            category: 'tax_payment_day',
            is_deleted: '',
            deleted_at: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      alert('Дни уплаты сохранены');
      await loadData();
    } catch (e) {
      console.error('Ошибка сохранения:', e);
      alert('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm('Сбросить все дни к значению по умолчанию (28)?')) return;
    const reset: Record<TaxType, number> = {
      vat: DEFAULT_PAYMENT_DAY,
      usn: DEFAULT_PAYMENT_DAY,
      profit: DEFAULT_PAYMENT_DAY,
      insurance: DEFAULT_PAYMENT_DAY,
      ndfl: DEFAULT_PAYMENT_DAY,
      ip_fixed: DEFAULT_PAYMENT_DAY,
    };
    setDays(reset);
  };

  if (loading) {
    return <div className="text-center py-12">Загрузка...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Дни уплаты налогов
      </h2>
      <p className="text-gray-500 mb-6">
        День месяца, до которого уплачивается налог. Используется в прогнозе
        кассовых разрывов.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700">
            <strong>Единый налоговый платёж</strong> в РФ — до 28-го числа
            месяца. Если в месяце меньше дней (например, февраль) — используется
            последний день месяца.
          </p>
        </div>

        <div className="space-y-4">
          {TAX_TYPES.map((t) => (
            <div
              key={t.key}
              className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0"
            >
              <div className="flex-1 pr-4">
                <p className="text-sm font-medium text-gray-900">{t.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={days[t.key]}
                  onChange={(e) =>
                    setDays({ ...days, [t.key]: parseInt(e.target.value) || 0 })
                  }
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                />
                <span className="text-xs text-gray-400">число</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            Сбросить к 28
          </button>
        </div>
      </div>
    </div>
  );
}
