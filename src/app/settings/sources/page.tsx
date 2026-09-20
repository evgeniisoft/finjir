'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getTargetFields } from '@/lib/engine/targetFields';
import type { ImportTargetType } from '@/lib/engine/types';

export default function DataSourcesPage() {
  const [sources, setSources] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [selectedMapping, setSelectedMapping] = useState<any>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<string[][]>([]);
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [mappingFields, setMappingFields] = useState<{ [k: string]: string }>({});
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const [sourceForm, setSourceForm] = useState({
    name: '',
    type: 'csv',
    target_type: 'transactions' as ImportTargetType,
    company_id: '',
    default_currency: 'RUB',
    record_type: 'fact',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [src, map, comp] = await Promise.all([
        api.getAll('DataSources'),
        api.getAll('DataMappings'),
        api.getAll('Companies'),
      ]);
      setSources(src);
      setMappings(map);
      setCompanies(comp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setFileName(file.name);
      setFileContent(content);

      const lines = content.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length > 0) {
        const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
        const parseLine = (line: string) => {
          const out: string[] = [];
          let cur = '';
          let q = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') q = !q;
            else if (c === delimiter && !q) { out.push(cur); cur = ''; }
            else cur += c;
          }
          out.push(cur);
          return out.map((s) => s.trim());
        };
        const headers = parseLine(lines[0]);
        setFileHeaders(headers);
        setFileRows(lines.slice(1).map(parseLine));

        const auto: { [k: string]: string } = {};
        for (const h of headers) {
          const l = h.toLowerCase();
          if (l.includes('дат')) auto[h] = 'date';
          else if (l.includes('сумм') || l.includes('amount') || l.includes('цена')) auto[h] = 'amount';
          else if (l.includes('описан') || l.includes('назнач') || l.includes('содержан')) auto[h] = 'description';
          else if (l.includes('валют')) auto[h] = 'currency';
          else if (l.includes('контрагент') || l.includes('поставщик') || l.includes('покупател')) auto[h] = 'counterparty';
          else if (l.includes('инн')) auto[h] = 'inn';
          else if (l.includes('кпп')) auto[h] = 'kpp';
        }
        setMappingFields(auto);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleCreateSource = async () => {
    if (!sourceForm.name) { alert('Введите название'); return; }
    if (!sourceForm.company_id) { alert('Выберите компанию'); return; }

    try {
      const config = JSON.stringify({ encoding: 'utf-8', delimiter: 'auto' });
      await api.create('DataSources', {
        name: sourceForm.name,
        type: sourceForm.type,
        target_type: sourceForm.target_type,
        company_id: sourceForm.company_id,
        config,
        is_active: true,
      });
      setShowForm(false);
      setSourceForm({ name: '', type: 'csv', target_type: 'transactions', company_id: '', default_currency: 'RUB', record_type: 'fact' });
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
      } catch {}
    }
  };

  const handleSaveMapping = async () => {
    if (!selectedSource) { alert('Выберите источник'); return; }
    if (fileHeaders.length === 0) { alert('Загрузите файл'); return; }

    try {
      const mappingName = `Маппинг для ${selectedSource.name}`;
      const existing = mappings.find((m) => m.source_id === selectedSource.id);

      const payload = {
        source_id: selectedSource.id,
        name: mappingName,
        target_type: selectedSource.target_type,
        mappings: JSON.stringify(mappingFields),
        defaults: JSON.stringify({ currency: sourceForm.default_currency, record_type: sourceForm.record_type }),
        transforms: JSON.stringify({
          date: 'parse_date',
          amount: 'parse_float',
        }),
        dedup_key: JSON.stringify(['date', 'amount', 'company_id', 'description']),
      };

      if (existing) {
        await api.update('DataMappings', existing.id, payload);
      } else {
        await api.create('DataMappings', payload);
      }

      await loadData();
      alert('Маппинг сохранён');
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    }
  };

  const handleImport = async () => {
    if (!selectedSource || !selectedMapping) { alert('Выберите источник и маппинг'); return; }
    if (!fileContent) { alert('Загрузите файл'); return; }

    try {
      setImporting(true);
      const res = await fetch('/api/import/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: selectedSource.id,
          mapping_id: selectedMapping.id,
          file_content: fileContent,
          file_name: fileName,
          company_id: sourceForm.company_id || selectedSource.company_id,
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
    if (!confirm('Откатить импорт? Все записи этой партии будут удалены.')) return;
    try {
      const res = await fetch('/api/import/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id }),
      });
      const data = await res.json();
      alert(`Откачено: ${data.deleted}`);
      setImportResult(null);
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    }
  };

  const targetFields = selectedSource ? getTargetFields(selectedSource.target_type) : [];

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
                <option value="1c">1С (CSV выгрузка)</option>
                <option value="excel">Excel (CSV на экспорт)</option>
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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">Сохранённые источники</h3>
        {loading ? <div className="text-gray-500">Загрузка...</div> : sources.length === 0 ? <p className="text-gray-500">Нет сохранённых источников</p> : (
          <div className="space-y-2">
            {sources.map((s) => (
              <div key={s.id} onClick={() => handleSelectSource(s)} className={`p-4 border rounded-lg cursor-pointer ${selectedSource?.id === s.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <p className="font-medium text-gray-900">{s.name}</p>
                <p className="text-sm text-gray-500">{s.type} • {s.target_type}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedSource && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Импорт: {selectedSource.name}</h3>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Файл CSV</label>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            {fileName && <p className="text-sm text-gray-500 mt-1">Загружен: {fileName}</p>}
          </div>

          {fileHeaders.length > 0 && (
            <>
              <h4 className="font-medium text-gray-900 mb-3">Сопоставление полей</h4>
              <div className="space-y-2 mb-4">
                {fileHeaders.map((h) => (
                  <div key={h} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-56">{h}</span>
                    <span className="text-gray-400">→</span>
                    <select value={mappingFields[h] || ''} onChange={(e) => setMappingFields({ ...mappingFields, [h]: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1">
                      <option value="">Не импортировать</option>
                      {targetFields.map((f) => <option key={f.value} value={f.value}>{f.label}{f.required ? ' *' : ''}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {fileRows.length > 0 && (
                <div className="mb-4 overflow-x-auto">
                  <h4 className="font-medium text-gray-900 mb-2">Предпросмотр (5 строк)</h4>
                  <table className="min-w-full text-sm">
                    <thead><tr>{fileHeaders.map((h) => <th key={h} className="px-2 py-1 text-left text-xs bg-gray-50">{h}</th>)}</tr></thead>
                    <tbody>{fileRows.slice(0, 5).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-2 py-1 text-gray-600">{c}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}

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
                <button onClick={handleImport} disabled={importing || !selectedMapping} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {importing ? 'Импорт...' : 'Импортировать'}
                </button>
              </div>
              {!selectedMapping && fileHeaders.length > 0 && (
                <p className="text-xs text-yellow-600 mt-2">Сначала сохраните маппинг</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
