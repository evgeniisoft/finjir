'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getTargetFields } from '@/lib/engine/targetFields';
import { suggestValue, suggestTargetField } from '@/lib/engine/autoMapper';
import type { ImportTargetType } from '@/lib/engine/types';

export default function DataSourcesPage() {
  const [sources, setSources] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [selectedMapping, setSelectedMapping] = useState<any>(null);

  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<string[][]>([]);
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [uniqueValues, setUniqueValues] = useState<{ [col: string]: string[] }>({});

  const [mappingFields, setMappingFields] = useState<{ [k: string]: string }>({});
  const [valueMappings, setValueMappings] = useState<{ [field: string]: { [val: string]: string } }>({});

  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const [sourceForm, setSourceForm] = useState({
    name: '',
    type: 'csv',
    target_type: 'transactions' as ImportTargetType,
    company_id: '',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [src, map, comp, acc, cp] = await Promise.all([
        api.getAll('DataSources'),
        api.getAll('DataMappings'),
        api.getAll('Companies'),
        api.getAll('Accounts'),
        api.getAll('Counterparties'),
      ]);
      setSources(src);
      setMappings(map);
      setCompanies(comp);
      setAccounts(acc);
      setCounterparties(cp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target?.result as string;
      setFileName(file.name);
      setFileContent(content);
      setImportResult(null);

      // Запрос preview + уникальные значения
      try {
        const res = await fetch('/api/import/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_content: content,
            target_type: selectedSource?.target_type || sourceForm.target_type,
          }),
        });
        const data = await res.json();

        setFileHeaders(data.headers || []);
        setFileRows(data.preview || []);
        setUniqueValues(data.unique_values || {});
        setMappingFields(data.auto_mapping || {});

        // Авто-маппинг значений на основе уникальных
        autoMapValues(data.auto_mapping || {}, data.unique_values || {});
      } catch (err) {
        console.error('Ошибка preview:', err);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const autoMapValues = (
    mapping: { [header: string]: string },
    unique: { [col: string]: string[] }
  ) => {
    const vm: { [field: string]: { [val: string]: string } } = {};

    for (const [header, targetField] of Object.entries(mapping)) {
      if (!targetField) continue;

      // Мапим значения только для account/counterparty/type
      const needsValueMapping = [
        'debit_account', 'credit_account',
        'counterparty',
        'type',
      ].includes(targetField);

      if (!needsValueMapping) continue;

      const values = unique[header] || [];
      if (values.length === 0) continue;

      const dict: { [val: string]: string } = {};
      for (const v of values) {
        const suggested = suggestValue(targetField, v, { accounts, counterparties });
        if (suggested) dict[v] = suggested;
      }

      if (Object.keys(dict).length > 0) {
        vm[targetField] = dict;
      }
    }

    setValueMappings(vm);
  };

  const handleCreateSource = async () => {
    if (!sourceForm.name) { alert('Введите название'); return; }
    if (!sourceForm.company_id) { alert('Выберите компанию'); return; }

    try {
      await api.create('DataSources', {
        name: sourceForm.name,
        type: sourceForm.type,
        target_type: sourceForm.target_type,
        company_id: sourceForm.company_id,
        config: JSON.stringify({ encoding: 'utf-8' }),
        is_active: true,
      });
      setShowForm(false);
      setSourceForm({ name: '', type: 'csv', target_type: 'transactions', company_id: '' });
      await loadData();
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    }
  };

  const handleSelectSource = (source: any) => {
    setSelectedSource(source);
    setImportResult(null);
    const map = mappings.find((m) => m.source_id === source.id);
    setSelectedMapping(map || null);
    if (map) {
      try {
        setMappingFields(JSON.parse(map.mappings || '{}'));
        setValueMappings(JSON.parse(map.value_mappings || '{}'));
      } catch {}
    }
  };

  const handleSaveMapping = async () => {
    if (!selectedSource) { alert('Выберите источник'); return; }
    if (fileHeaders.length === 0) { alert('Загрузите файл'); return; }

    try {
      const existing = mappings.find((m) => m.source_id === selectedSource.id);
      const payload = {
        source_id: selectedSource.id,
        name: `Маппинг для ${selectedSource.name}`,
        target_type: selectedSource.target_type,
        mappings: JSON.stringify(mappingFields),
        defaults: JSON.stringify({ currency: 'RUB', record_type: 'fact' }),
        transforms: JSON.stringify({ date: 'parse_date', amount: 'parse_float' }),
        value_mappings: JSON.stringify(valueMappings),
        dedup_key: JSON.stringify(['date', 'amount', 'company_id', 'description']),
      };

      if (existing) {
        await api.update('DataMappings', existing.id, payload);
      } else {
        await api.create('DataMappings', payload);
      }

      await loadData();
      const fresh = (await api.getAll('DataMappings')).find((m: any) => m.source_id === selectedSource.id);
      setSelectedMapping(fresh || null);
      alert('Маппинг сохранён');
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    }
  };

  const handleImport = async () => {
    if (!selectedSource) { alert('Выберите источник'); return; }
    let mapping = selectedMapping;
    if (!mapping) {
      mapping = mappings.find((m) => m.source_id === selectedSource.id);
      if (mapping) setSelectedMapping(mapping);
    }
    if (!mapping) { alert('Сначала сохраните маппинг'); return; }
    if (!fileContent) { alert('Загрузите файл'); return; }

    try {
      setImporting(true);
      const res = await fetch('/api/import/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: selectedSource.id,
          mapping_id: mapping.id,
          file_content: fileContent,
          file_name: fileName,
          company_id: selectedSource.company_id,
        }),
      });
      const data = await res.json();
      setImportResult(data);
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleRollback = async (batch_id: string) => {
    if (!confirm('Откатить импорт? Все записи партии будут удалены.')) return;
    try {
      await fetch('/api/import/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id }),
      });
      alert('Откат выполнен');
      setImportResult(null);
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    }
  };

  const handleDeleteSource = async (source: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Удалить источник "${source.name}"?`)) return;
    try {
      const related = mappings.filter((m) => m.source_id === source.id);
      for (const m of related) await api.delete('DataMappings', m.id);
      await api.delete('DataSources', source.id);
      if (selectedSource?.id === source.id) { setSelectedSource(null); setSelectedMapping(null); }
      await loadData();
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  const handleRenameSource = async (source: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt('Новое название:', source.name);
    if (!newName || newName === source.name) return;
    try {
      await api.update('DataSources', source.id, { name: newName });
      await loadData();
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  };

  // Проверка готовности к импорту
  const targetFields = selectedSource ? getTargetFields(selectedSource.target_type) : [];
  const requiredFields = targetFields.filter((f) => f.required);
  const mappedTargetFields = Object.values(mappingFields).filter(Boolean);
  const missingRequired = requiredFields.filter((f) => !mappedTargetFields.includes(f.value));

  // Какие колонки требуют маппинга значений
  const valueFieldsToMap = Object.entries(mappingFields)
    .filter(([, target]) => ['debit_account', 'credit_account', 'counterparty', 'type'].includes(target as string))
    .map(([header, target]) => ({ header, target: target as string }));

  // Проверка готовности значений
  const valueMappingIssues = valueFieldsToMap.map(({ header, target }) => {
    const values = uniqueValues[header] || [];
    const mapped = valueMappings[target] || {};
    const unresolved = values.filter((v) => !mapped[v]);
    return { header, target, total: values.length, unresolved };
  });

  const hasBlockingIssues = missingRequired.length > 0 || valueMappingIssues.some((i) => i.unresolved.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Источники данных</h2>
          <p className="text-gray-500 mt-1">Подключение и настройка внешних источников</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
          + Добавить источник
        </button>
      </div>

      {/* Форма создания */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Новый источник</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
              <input type="text" value={sourceForm.name} onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="1С УНФ" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Тип *</label>
              <select value={sourceForm.type} onChange={(e) => setSourceForm({ ...sourceForm, type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="csv">CSV файл</option>
                <option value="excel">Excel файл</option>
                <option value="1c">1С (CSV выгрузка)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Что импортируем *</label>
              <select value={sourceForm.target_type} onChange={(e) => setSourceForm({ ...sourceForm, target_type: e.target.value as ImportTargetType })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="transactions">Операции</option>
                <option value="companies">Компании</option>
                <option value="counterparties">Контрагенты</option>
                <option value="accounts">Счета</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Компания *</label>
              <select value={sourceForm.company_id} onChange={(e) => setSourceForm({ ...sourceForm, company_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">Выберите компанию</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleCreateSource} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Сохранить</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Отмена</button>
          </div>
        </div>
      )}

      {/* Список источников */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">Сохранённые источники</h3>
        {loading ? <div className="text-gray-500">Загрузка...</div> : sources.length === 0 ? <p className="text-gray-500">Нет сохранённых источников</p> : (
          <div className="space-y-2">
            {sources.map((s) => (
              <div key={s.id} onClick={() => handleSelectSource(s)} className={`p-4 border rounded-lg cursor-pointer ${selectedSource?.id === s.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p className="text-sm text-gray-500">{s.type} • {s.target_type}</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={(e) => handleRenameSource(s, e)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Изменить</button>
                    <button onClick={(e) => handleDeleteSource(s, e)} className="text-red-600 hover:text-red-800 text-sm font-medium">Удалить</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Работа с источником */}
      {selectedSource && (
        <div className="space-y-6">
          {/* 1. Файл */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">1. Загрузка файла</h3>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            {fileName && <p className="text-sm text-gray-500 mt-2">Загружен: {fileName} · {fileRows.length > 0 ? 'строк: ' + (fileRows.length === 5 ? '≥5' : fileRows.length) : ''}</p>}
          </div>

          {/* 2. Маппинг полей */}
          {fileHeaders.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">2. Сопоставление полей</h3>
                <p className="text-sm text-gray-500">Мы автоматически сопоставили большинство полей</p>
              </div>

              <div className="space-y-2">
                {fileHeaders.map((h) => {
                  const suggested = suggestTargetField(h, targetFields.map((f) => f.value)) || '';
                  const current = mappingFields[h] || '';
                  const isRequiredMapped = current && targetFields.find((f) => f.value === current)?.required;
                  const isMissing = !current && targetFields.some((f) => f.required);

                  return (
                    <div key={h} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-56 flex items-center gap-2">
                        {h}
                        {suggested && suggested === current && <span className="text-xs text-green-600">✓</span>}
                        {isMissing && <span className="text-xs text-red-500">⚠</span>}
                      </span>
                      <span className="text-gray-400">→</span>
                      <select value={current} onChange={(e) => {
                        const newMapping = { ...mappingFields, [h]: e.target.value };
                        setMappingFields(newMapping);
                        autoMapValues(newMapping, uniqueValues);
                      }} className={`px-3 py-2 border rounded-lg text-sm flex-1 ${isMissing ? 'border-red-300' : 'border-gray-300'}`}>
                        <option value="">Не импортировать</option>
                        {targetFields.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}{f.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {missingRequired.length > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">Не сопоставлены обязательные поля: {missingRequired.map((f) => f.label).join(', ')}</p>
                </div>
              )}
            </div>
          )}

          {/* 3. Маппинг значений */}
          {valueFieldsToMap.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">3. Маппинг значений</h3>
                <p className="text-sm text-gray-500 mt-1">Система нашла значения в файле, которые нужно преобразовать в наши ID. Большинство уже сопоставлено автоматически.</p>
              </div>

              {valueFieldsToMap.map(({ header, target }) => {
                const values = uniqueValues[header] || [];
                const dict = valueMappings[target] || {};
                const issues = valueMappingIssues.find((i) => i.target === target);

                return (
                  <div key={target} className="mb-6 last:mb-0">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      {targetFields.find((f) => f.value === target)?.label || target}
                      <span className="text-xs text-gray-400 ml-2">(из колонки "{header}")</span>
                      {issues?.unresolved.length ? (
                        <span className="text-xs text-yellow-600 ml-2">⚠ {issues.unresolved.length} из {issues.total} не сопоставлено</span>
                      ) : (
                        <span className="text-xs text-green-600 ml-2">✓ все сопоставлены</span>
                      )}
                    </h4>

                    <div className="space-y-1">
                      {values.slice(0, 20).map((v) => {
                        const mapped = dict[v] || '';
                        const isUnresolved = !mapped;

                        return (
                          <div key={v} className="flex items-center gap-3">
                            <span className={`text-sm font-mono w-56 truncate ${isUnresolved ? 'text-yellow-700' : 'text-gray-600'}`}>
                              {v}
                            </span>
                            <span className="text-gray-400">→</span>
                            {target === 'type' ? (
                              <select value={mapped} onChange={(e) => {
                                const newVM = { ...valueMappings };
                                newVM[target] = { ...(newVM[target] || {}), [v]: e.target.value };
                                setValueMappings(newVM);
                              }} className="px-3 py-1.5 border border-gray-300 rounded text-sm flex-1">
                                <option value="">Не выбрано</option>
                                <option value="income">Доход (income)</option>
                                <option value="expense">Расход (expense)</option>
                                <option value="transfer">Перемещение (transfer)</option>
                              </select>
                            ) : (
                              <select value={mapped} onChange={(e) => {
                                const newVM = { ...valueMappings };
                                newVM[target] = { ...(newVM[target] || {}), [v]: e.target.value };
                                setValueMappings(newVM);
                              }} className={`px-3 py-1.5 border rounded text-sm flex-1 ${isUnresolved ? 'border-yellow-300 bg-yellow-50' : 'border-gray-300'}`}>
                                <option value="">Не выбрано</option>
                                {(target === 'counterparty' ? counterparties : accounts).map((item: any) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}{item.code ? ` (${item.code})` : ''}{item.source_code ? ` [${item.source_code}]` : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                      {values.length > 20 && (
                        <p className="text-xs text-gray-400 mt-1">… и ещё {values.length - 20} значений</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 4. Проверка и импорт */}
          {fileHeaders.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">4. Проверка и импорт</h3>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Файл загружен</span>
                  <span className="text-green-600">✓ {fileName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Сопоставление полей</span>
                  <span className={missingRequired.length === 0 ? 'text-green-600' : 'text-red-600'}>
                    {missingRequired.length === 0 ? '✓ все обязательные' : `✗ не хватает: ${missingRequired.length}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Маппинг значений</span>
                  <span className={valueMappingIssues.every((i) => i.unresolved.length === 0) ? 'text-green-600' : 'text-yellow-600'}>
                    {valueMappingIssues.every((i) => i.unresolved.length === 0)
                      ? '✓ всё сопоставлено'
                      : `⚠ не сопоставлено: ${valueMappingIssues.reduce((s, i) => s + i.unresolved.length, 0)}`}
                  </span>
                </div>
              </div>

              {importResult && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="text-blue-800">Импорт: создано {importResult.imported}, пропущено {importResult.skipped}, ошибок {importResult.errors?.length || 0}</p>
                  <p className="text-xs text-blue-600 mt-1">Batch: {importResult.batch_id}</p>
                  {importResult.errors?.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-red-600 cursor-pointer">Ошибки ({importResult.errors.length})</summary>
                      <pre className="text-xs text-red-500 mt-1 whitespace-pre-wrap max-h-40 overflow-auto">{importResult.errors.slice(0, 20).join('\n')}</pre>
                    </details>
                  )}
                  <button onClick={() => handleRollback(importResult.batch_id)} className="mt-2 text-xs text-red-600 hover:text-red-800 underline">Откатить этот импорт</button>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={handleSaveMapping} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Сохранить маппинг</button>
                <button onClick={handleImport} disabled={importing || hasBlockingIssues} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {importing ? 'Импорт...' : 'Импортировать'}
                </button>
              </div>
              {hasBlockingIssues && (
                <p className="text-xs text-red-600 mt-2">
                  Исправьте проблемы перед импортом
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
