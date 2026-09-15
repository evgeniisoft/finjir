'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function PaymentDelaysPage() {
    const [settings, setSettings] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [delays, setDelays] = useState<{ [key: string]: number }>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        // Пересчитываем delays при смене компании
        if (selectedCompany && settings.length > 0) {
            const delaysMap: { [key: string]: number } = {};
            for (const s of settings) {
                if (s.category === 'payment_delay' && s.key.startsWith(`payment_delay_${selectedCompany}_`)) {
                    const accountId = s.key.replace(`payment_delay_${selectedCompany}_`, '');
                    delaysMap[accountId] = parseFloat(s.value || '0');
                }
            }
            setDelays(delaysMap);
        }
    }, [selectedCompany, settings]);

    const loadData = async () => {
        try {
            const [settingsData, accountsData, companiesData] = await Promise.all([
                api.getAll('Settings'),
                api.getAll('Accounts'),
                api.getAll('Companies')
            ]);

            setSettings(Array.isArray(settingsData) ? settingsData : []);
            setAccounts(Array.isArray(accountsData) ? accountsData : []);
            setCompanies(Array.isArray(companiesData) ? companiesData : []);

            if (companiesData.length > 0 && !selectedCompany) {
                setSelectedCompany(companiesData[0].id);
            }
        } catch (error) {
            console.error('Ошибка:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);

            for (const [accountId, days] of Object.entries(delays)) {
                const key = `payment_delay_${selectedCompany}_${accountId}`;
                const existing = settings.find(s => s.key === key);

                if (existing) {
                    await api.update('Settings', existing.id, {
                        value: String(days)
                    });
                } else {
                    await api.create('Settings', {
                        key,
                        value: String(days),
                        description: `Отсрочка: ${accounts.find(a => a.id === accountId)?.name || accountId}`,
                        category: 'payment_delay',
                        is_deleted: '',
                        deleted_at: '',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                }
            }

            alert('Отсрочки сохранены');
            await loadData();
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка при сохранении');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="text-center py-12">Загрузка...</div>;
    }

    const relevantAccounts = accounts.filter(a =>
        (a.type === 'I' || a.type === 'X') &&
        a.activity_type !== 'investing'
    );

    return (
        <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Отсрочки платежей</h2>
            <p className="text-gray-500 mb-6">
                Настройка периода между начислением (БДР) и оплатой (БДДС)
            </p>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Компания</label>
                    <select
                        value={selectedCompany}
                        onChange={(e) => setSelectedCompany(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                <div className="space-y-2">
                    {relevantAccounts.map(acc => (
                        <div key={acc.id} className="flex items-center justify-between py-2 border-b last:border-0">
                            <span className="text-sm text-gray-600">{acc.name}</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="0"
                                    max="365"
                                    value={delays[acc.id] || 0}
                                    onChange={(e) => setDelays({ ...delays, [acc.id]: parseInt(e.target.value) || 0 })}
                                    className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                                />
                                <span className="text-xs text-gray-400">дней</span>
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? 'Сохранение...' : 'Сохранить отсрочки'}
                </button>
            </div>
        </div>
    );
}
