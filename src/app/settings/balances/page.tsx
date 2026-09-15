'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function InitialBalancesPage() {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [balances, setBalances] = useState<any[]>([]);

    // Форма
    const [formData, setFormData] = useState({
        company_id: '',
        account_id: '',
        amount: '',
        date: '2026-01-01'
    });

    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [accountsData, companiesData, transactionsData] = await Promise.all([
                api.getAll('Accounts'),
                api.getAll('Companies'),
                api.getAll('Transactions')
            ]);

            setAccounts(accountsData);
            setCompanies(companiesData);

            const initialBalances = transactionsData.filter(t =>
                t.credit_account_id === 'acc-equity-001' ||
                t.description?.includes('Начальный остаток')
            );
            setBalances(initialBalances);

        } catch (error) {
            console.error('Ошибка загрузки:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (balance: any) => {
        setEditingId(balance.id);
        setFormData({
            company_id: balance.company_id || '',
            account_id: balance.debit_account_id || '',
            amount: String(balance.amount || ''),
            date: String(balance.date || '').split('T')[0],
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setFormData({ company_id: '', account_id: '', amount: '', date: '2026-01-01' });
    };

    const handleAddBalance = async () => {
        if (!formData.company_id || !formData.account_id || !formData.amount) {
            alert('Заполните все поля');
            return;
        }

        try {
            const amount = parseFloat(formData.amount);

            await api.create('Transactions', {
                date: formData.date,
                company_id: formData.company_id,
                description: `Начальный остаток (введён вручную)`,
                amount: amount,
                currency: 'RUB',
                type: 'income',
                debit_account_id: formData.account_id,
                credit_account_id: 'acc-equity-001',
                amount_rub: amount,
                counterparty_id: '',
                contract_id: '',
                transaction_group_id: '',
                is_system: false,
                external_id: '',
                source: 'manual',
                deleted_at: '',
                is_deleted: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                tenant_id: 'tenant-1',
                record_type: 'fact',
                accrual_date: formData.date,
                import_hash: `hash-balance-${Date.now()}`,
                source_account_id: '',
                destination_account_id: formData.account_id
            });

            alert('Остаток добавлен');
            setFormData({ company_id: '', account_id: '', amount: '', date: '2026-01-01' });
            loadData();
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка при добавлении остатка');
        }
    };

    const handleUpdateBalance = async () => {
        if (!editingId) return;
        if (!formData.company_id || !formData.account_id || !formData.amount) {
            alert('Заполните все поля');
            return;
        }

        try {
            const amount = parseFloat(formData.amount);

            await api.update('Transactions', editingId, {
                date: formData.date,
                company_id: formData.company_id,
                amount: amount,
                amount_rub: amount,
                debit_account_id: formData.account_id,
                accrual_date: formData.date,
                destination_account_id: formData.account_id,
            });

            alert('Остаток обновлён');
            setEditingId(null);
            setFormData({ company_id: '', account_id: '', amount: '', date: '2026-01-01' });
            loadData();
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка при обновлении остатка');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Удалить начальный остаток?')) return;
        try {
            await api.delete('Transactions', id);
            loadData();
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка при удалении');
        }
    };

    return (
        <div>
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Начальные остатки</h2>
                <p className="text-gray-500 mt-1">
                    Ввод остатков на дату начала учёта
                </p>
            </div>

            {/* Форма добавления/редактирования */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {editingId ? 'Редактировать остаток' : 'Добавить остаток'}
                </h3>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Компания</label>
                        <select
                            value={formData.company_id}
                            onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                            <option value="">Выберите компанию</option>
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Счёт</label>
                        <select
                            value={formData.account_id}
                            onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                            <option value="">Выберите счёт</option>
                            {accounts.filter(a => a.is_cash_flow === 'true' || a.is_cash_flow === true).map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Сумма</label>
                        <input
                            type="text"
                            value={formData.amount ? parseFloat(formData.amount).toLocaleString('ru-RU') : ''}
                            onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '');
                                setFormData({ ...formData, amount: value });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="0.00"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Дата</label>
                        <input
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                    </div>
                </div>

                <div className="mt-4 flex gap-3">
                    <button
                        onClick={editingId ? handleUpdateBalance : handleAddBalance}
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                    >
                        {editingId ? 'Сохранить изменения' : 'Добавить остаток'}
                    </button>
                    {editingId && (
                        <button
                            onClick={handleCancelEdit}
                            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200"
                        >
                            Отмена
                        </button>
                    )}
                </div>
            </div>

            {/* Список остатков */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Дата</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Компания</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Счёт</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Сумма</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {balances.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                    Нет начальных остатков
                                </td>
                            </tr>
                        ) : (
                            balances.map(b => {
                                const company = companies.find(c => c.id === b.company_id);
                                const account = accounts.find(a => a.id === b.debit_account_id);
                                const displayDate = String(b.date || '').split('T')[0];
                                return (
                                    <tr key={b.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm text-gray-900">{displayDate}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{company?.name || b.company_id}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{account?.name || b.debit_account_id}</td>
                                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                                            {parseFloat(b.amount)?.toLocaleString('ru-RU')} ₽
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-3">
                                            <button
                                                onClick={() => handleEdit(b)}
                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                            >
                                                Изменить
                                            </button>
                                            <button
                                                onClick={() => handleDelete(b.id)}
                                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                                            >
                                                Удалить
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
