'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// ============================================
// Утилиты
// ============================================

function formatDate(date: any): string {
  if (!date) return '—';
  const str = typeof date === 'string' ? date.split('T')[0] : '';
  const [y, m, d] = str.split('-');
  if (!y || !m || !d) return String(date);
  return `${d}.${m}.${y}`;
}

function canEdit(transaction: any): boolean {
  // Редактируем только ручные операции
  return transaction?.source === 'manual';
}

function canDelete(transaction: any): boolean {
  // Удалять можно все, но с подтверждением
  return true;
}

export default function TransactionsPage() {
  // Данные
  const [transactions, setTransactions] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);

  // Состояние
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Фильтры
  const [filters, setFilters] = useState({
    company_id: '',
    period_start: '',
    period_end: '',
    type: '',
    search: ''
  });

  // Форма
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    currency: 'RUB',
    type: 'income',
    company_id: '',
    account_id: '',
    category_id: '',
    counterparty_id: '',
    source: 'manual',
    record_type: 'fact' as 'fact' | 'plan',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [transactionsData, companiesData, accountsData, counterpartiesData] = await Promise.all([
        api.getAll('Transactions'),
        api.getAll('Companies'),
        api.getAll('Accounts'),
        api.getAll('Counterparties')
      ]);

      setTransactions(Array.isArray(transactionsData) ? transactionsData : []);
      setCompanies(Array.isArray(companiesData) ? companiesData : []);
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
      setCounterparties(Array.isArray(counterpartiesData) ? counterpartiesData : []);
      setError(null);
    } catch (err) {
      setError('Ошибка при загрузке данных');
      console.error('Ошибка загрузки:', err);
    } finally {
      setLoading(false);
    }
  };

  // Денежные счета
  const cashAccounts = accounts.filter(a =>
    a.is_cash_flow === true || a.is_cash_flow === 'true' || a.is_cash_flow === 'TRUE'
  );

  // Статьи доходов/расходов
  const incomeAccounts = accounts.filter(a => a.type === 'I');
  const expenseAccounts = accounts.filter(a => a.type === 'X');

  // Фильтрация транзакций
  const filteredTransactions = transactions.filter(t => {
    if (filters.company_id && t.company_id !== filters.company_id) return false;
    if (filters.period_start && t.date < filters.period_start) return false;
    if (filters.period_end && t.date > filters.period_end) return false;
    if (filters.type && t.type !== filters.type) return false;
    if (filters.search && !t.description?.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  // ============================================
  // Создание / Редактирование
  // ============================================

  const handleCreate = async () => {
    try {
      if (!formData.company_id) { alert('Выберите компанию'); return; }
      if (!formData.amount || parseFloat(formData.amount) <= 0) { alert('Введите сумму'); return; }
      if (!formData.description.trim()) { alert('Введите описание'); return; }

      let debitAccountId, creditAccountId;
      if (formData.type === 'income') {
        debitAccountId = formData.account_id || cashAccounts[0]?.id;
        creditAccountId = formData.category_id || incomeAccounts[0]?.id;
      } else if (formData.type === 'expense') {
        debitAccountId = formData.category_id || expenseAccounts[0]?.id;
        creditAccountId = formData.account_id || cashAccounts[0]?.id;
      } else {
        debitAccountId = formData.account_id;
        creditAccountId = formData.category_id;
      }

      const tx = {
        date: formData.date,
        company_id: formData.company_id,
        description: formData.description.trim(),
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        type: formData.type,
        debit_account_id: debitAccountId,
        credit_account_id: creditAccountId,
        amount_rub: parseFloat(formData.amount),
        counterparty_id: formData.counterparty_id,
        contract_id: '',
        transaction_group_id: '',
        is_system: false,
        external_id: '',
        source: formData.source || 'manual',
        deleted_at: null,
        updated_at: new Date().toISOString(),
        tenant_id: 'tenant-1',
        record_type: formData.record_type || 'fact',
        accrual_date: formData.date,
        source_account_id: formData.type === 'income' ? '' : (formData.account_id || 'acc-bank-001'),
        destination_account_id: formData.type === 'income' ? (formData.account_id || 'acc-bank-001') : '',
      };

      setSaving(true);

      if (editingId) {
        await api.update('Transactions', editingId, tx);
      } else {
        await api.create('Transactions', {
          ...tx,
          import_hash: '',
          created_at: new Date().toISOString(),
        });
      }

      setShowForm(false);
      setEditingId(null);
      resetForm();
      await loadData();
    } catch (err) {
      console.error('Ошибка сохранения:', err);
      alert('Ошибка при сохранении операции');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (transaction: any) => {
    if (!canEdit(transaction)) {
      alert('Импортированные операции нельзя редактировать. Их можно только удалить.');
      return;
    }

    // Разбираем счёт и статью из транзакции
    let accountId = '';
    let categoryId = '';
    if (transaction.type === 'income') {
      accountId = transaction.debit_account_id;
      categoryId = transaction.credit_account_id;
    } else if (transaction.type === 'expense') {
      accountId = transaction.credit_account_id;
      categoryId = transaction.debit_account_id;
    } else {
      accountId = transaction.debit_account_id;
      categoryId = transaction.credit_account_id;
    }

    setFormData({
      date: transaction.date?.split('T')[0] || '',
      description: transaction.description || '',
      amount: String(transaction.amount_rub || transaction.amount || ''),
      currency: transaction.currency || 'RUB',
      type: transaction.type || 'income',
      company_id: transaction.company_id || '',
      account_id: accountId,
      category_id: categoryId,
      counterparty_id: transaction.counterparty_id || '',
      source: transaction.source || 'manual',
      record_type: (transaction.record_type || 'fact') as 'fact' | 'plan',
    });

    setEditingId(transaction.id);
    setShowForm(true);

    // Скролл к форме
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
  };

  const handleDelete = async (transaction: any) => {
    if (!canDelete(transaction)) {
      alert('Эту операцию нельзя удалить.');
      return;
    }

    const dateStr = formatDate(transaction.date);
    const amountStr = Math.round(Number(transaction.amount_rub || transaction.amount || 0))
      .toLocaleString('ru-RU');

    const confirmed = window.confirm(
      `Удалить операцию?\n\n` +
      `Дата: ${dateStr}\n` +
      `Описание: ${transaction.description}\n` +
      `Сумма: ${amountStr} ₽\n\n` +
      `ВНИМАНИЕ: удаление повлияет на отчёты, диагностику и прогноз. ` +
      `Действие необратимо.`,
    );

    if (!confirmed) return;

    try {
      await api.delete('Transactions', transaction.id);
      await loadData();
    } catch (err) {
      console.error('Ошибка удаления:', err);
      alert('Ошибка при удалении операции');
    }
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      amount: '',
      currency: 'RUB',
      type: 'income',
      company_id: '',
      account_id: '',
      category_id: '',
      counterparty_id: '',
      source: 'manual',
      record_type: 'fact',
    });
    setEditingId(null);
  };

  const resetFilters = () => {
    setFilters({
      company_id: '',
      period_start: '',
      period_end: '',
      type: '',
      search: ''
    });
  };

  // ============================================
  // Рендер
  // ============================================

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Операции</h2>
          <p className="text-gray-500 mt-1">Журнал финансовых операций</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-all shadow-sm hover:shadow-md cursor-pointer"
        >
          + Добавить операцию
        </button>
      </div>

      {/* Фильтры */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Компания</label>
            <select
              value={filters.company_id}
              onChange={(e) => setFilters({ ...filters, company_id: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Все компании</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">С даты</label>
            <input
              type="date"
              value={filters.period_start}
              onChange={(e) => setFilters({ ...filters, period_start: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">По дату</label>
            <input
              type="date"
              value={filters.period_end}
              onChange={(e) => setFilters({ ...filters, period_end: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Тип</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Все</option>
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
              <option value="transfer">Перемещение</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Поиск</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Поиск по описанию..."
            />
          </div>

          <button
            onClick={resetFilters}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Сбросить
          </button>
        </div>
      </div>

      {/* Форма */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Редактирование операции' : 'Новая операция'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Компания <span className="text-red-500">*</span>
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип операции <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="income">Доход</option>
                <option value="expense">Расход</option>
                <option value="transfer">Перемещение</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип записи
              </label>
              <select
                value={formData.record_type}
                onChange={(e) => setFormData({ ...formData, record_type: e.target.value as 'fact' | 'plan' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="fact">Факт (произошло)</option>
                <option value="plan">План (ожидается)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Факт — прошедшие операции. План — будущие.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.type === 'income' ? 'Счёт зачисления' : formData.type === 'expense' ? 'Счёт списания' : 'Счёт отправитель'}
              </label>
              <select
                value={formData.account_id}
                onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Выберите счёт</option>
                {cashAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.type === 'income' ? 'Статья дохода' : formData.type === 'expense' ? 'Статья расхода' : 'Счёт получатель'}
              </label>
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Выберите статью</option>
                {formData.type === 'income' && incomeAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
                {formData.type === 'expense' && expenseAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
                {formData.type === 'transfer' && cashAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Сумма <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={formData.amount ? Number(formData.amount).toLocaleString('ru-RU') : ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
                  setFormData({ ...formData, amount: raw });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-right"
                placeholder="0"
              />
              {formData.amount && (
                <p className="text-xs text-gray-500 mt-1">
                  {Number(formData.amount).toLocaleString('ru-RU')} ₽
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Валюта</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="RUB">₽ Рубль</option>
                <option value="USD">$ Доллар</option>
                <option value="EUR">€ Евро</option>
                <option value="CNY">¥ Юань</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Контрагент</label>
              <select
                value={formData.counterparty_id}
                onChange={(e) => setFormData({ ...formData, counterparty_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Выберите контрагента</option>
                {counterparties.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Описание <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Оплата по счёту №123"
              />
            </div>

            <div className="md:col-span-2 flex gap-3 pt-4">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : editingId ? 'Сохранить изменения' : 'Создать операцию'}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                disabled={saving}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Таблица */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Дата</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Компания</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Описание</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Сумма</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Тип</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredTransactions.map((transaction) => {
                const company = companies.find(c => c.id === transaction.company_id);
                const editable = canEdit(transaction);
                const deletable = canDelete(transaction);
                return (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      {formatDate(transaction.date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {company ? company.name : transaction.company_id}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {transaction.description}
                      {transaction.record_type === 'plan' && (
                        <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
                          план
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right whitespace-nowrap">
                      {parseFloat(transaction.amount)?.toLocaleString('ru-RU')} {transaction.currency}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${transaction.type === 'income'
                          ? 'bg-green-100 text-green-800'
                          : transaction.type === 'expense'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                        {transaction.type === 'income' ? 'Доход' : transaction.type === 'expense' ? 'Расход' : 'Перемещение'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleEdit(transaction)}
                        disabled={!editable}
                        title={editable ? 'Изменить' : 'Импортированные операции нельзя редактировать'}
                        className={`text-xs font-medium mr-3 ${
                          editable
                            ? 'text-blue-600 hover:text-blue-700'
                            : 'text-gray-300 cursor-not-allowed'
                        }`}
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(transaction)}
                        disabled={!deletable}
                        className={`text-xs font-medium ${
                          deletable
                            ? 'text-red-600 hover:text-red-700'
                            : 'text-gray-300 cursor-not-allowed'
                        }`}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredTransactions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">Операции не найдены</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
