'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';

// ============================================
// Типы
// ============================================

interface ForecastItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: 'inflow' | 'outflow';
  type: 'transaction' | 'tax' | 'transfer';
  account_id: string;
  account_name: string;
  company_id: string;
  company_name: string;
  source: 'fact' | 'plan' | 'calculated';
  record_type?: string;
}

interface ForecastDay {
  date: string;
  balance_start: number;
  inflow: number;
  outflow: number;
  balance_end: number;
  is_gap: boolean;
  gap_amount: number;
  items: ForecastItem[];
}

interface ForecastGap {
  date: string;
  end_date: string;
  duration_days: number;
  max_deficit: number;
  reasons: ForecastItem[];
  recommendations: string[];
}

interface ForecastBlock {
  days: ForecastDay[];
  gaps: ForecastGap[];
  starting_balance: number;
  ending_balance: number;
  total_inflow: number;
  total_outflow: number;
}

interface ForecastResult {
  params: {
    start_date: string;
    end_date: string;
    horizon_days: number;
    company_id: string | null;
    include_plan: boolean;
    include_taxes: boolean;
  };
  consolidated: ForecastBlock;
  by_company: Array<{
    company_id: string;
    company_name: string;
    days: ForecastDay[];
    gaps: ForecastGap[];
    starting_balance: number;
    ending_balance: number;
    total_inflow: number;
    total_outflow: number;
  }>;
}

interface ForecastViewProps {
  viewMode: 'consolidated' | 'by_company';
  companyId: string | null;
  companies: any[];
}

// ============================================
// Константы
// ============================================

const HORIZON_OPTIONS = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
  { value: 180, label: '180 дней' },
  { value: 365, label: '365 дней' },
];

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// ============================================
// Утилиты
// ============================================

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('ru-RU') + ' ₽';
}

function fmtSigned(v: number): string {
  if (v === 0) return '0 ₽';
  const sign = v > 0 ? '+' : '−';
  return sign + Math.abs(Math.round(v)).toLocaleString('ru-RU') + ' ₽';
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function fmtDateShort(d: string): string {
  const [, m, day] = d.split('-');
  return `${day}.${m}`;
}

/**
 * Красивая подпись суммы: миллионы/тысячи.
 * 31804600 → "31,8 млн"
 * 1304600  → "1,3 млн"
 * 450000   → "450 тыс."
 * 1200     → "1,2 тыс."
 * 500      → "500"
 */
function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')} млн`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1).replace('.', ',')} тыс.`;
  }
  return `${sign}${Math.round(abs)}`;
}

// ============================================
// Основной компонент
// ============================================

export default function ForecastView({ viewMode, companyId, companies }: ForecastViewProps) {
  const [horizon, setHorizon] = useState(30);
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [data, setData] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, startDate, companyId, viewMode]);

  const loadForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('start_date', startDate);
      params.set('horizon_days', String(horizon));
      if (companyId) params.set('company_id', companyId);

      const res = await fetch(`/api/reports/cashflow-forecast?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка загрузки прогноза');
      }
      const json: ForecastResult = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
        <p className="text-sm text-gray-500">Загрузка прогноза...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  if (viewMode === 'consolidated') {
    return (
      <div className="space-y-6">
        <Filters
          horizon={horizon}
          setHorizon={setHorizon}
          startDate={startDate}
          setStartDate={setStartDate}
        />
        <ForecastBlockView
          title="Холдинг (консолидированный)"
          block={data.consolidated}
          startDate={data.params.start_date}
          endDate={data.params.end_date}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Filters
        horizon={horizon}
        setHorizon={setHorizon}
        startDate={startDate}
        setStartDate={setStartDate}
      />
      {data.by_company.map(company => (
        <ForecastBlockView
          key={company.company_id}
          title={company.company_name}
          block={{
            days: company.days,
            gaps: company.gaps,
            starting_balance: company.starting_balance,
            ending_balance: company.ending_balance,
            total_inflow: company.total_inflow,
            total_outflow: company.total_outflow,
          }}
          startDate={data.params.start_date}
          endDate={data.params.end_date}
        />
      ))}
    </div>
  );
}

// ============================================
// Фильтры
// ============================================

function Filters({
  horizon,
  setHorizon,
  startDate,
  setStartDate,
}: {
  horizon: number;
  setHorizon: (v: number) => void;
  startDate: string;
  setStartDate: (v: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Начало прогноза</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Горизонт</label>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {HORIZON_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setHorizon(opt.value)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  horizon === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Блок прогноза
// ============================================

function ForecastBlockView({
  title,
  block,
  startDate,
  endDate,
}: {
  title: string;
  block: ForecastBlock;
  startDate: string;
  endDate: string;
}) {
  const [showAllDays, setShowAllDays] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const hasGaps = block.gaps.length > 0;

  const daysWithItems = useMemo(
    () => block.days.filter(d => d.items.length > 0),
    [block.days],
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Прогноз с {fmtDate(startDate)} по {fmtDate(endDate)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-gray-100">
        <StatCard label="Стартовый остаток" value={fmtMoney(block.starting_balance)} />
        <StatCard
          label="Поступления"
          value={fmtSigned(block.total_inflow)}
          color={block.total_inflow > 0 ? 'green' : 'gray'}
        />
        <StatCard
          label="Выбытия"
          value={fmtSigned(-block.total_outflow)}
          color={block.total_outflow > 0 ? 'red' : 'gray'}
        />
        <StatCard
          label="Конечный остаток"
          value={fmtMoney(block.ending_balance)}
          color={block.ending_balance >= 0 ? 'green' : 'red'}
        />
      </div>

      {block.days.length > 0 && (
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700">Динамика остатка</h4>
            <Legend />
          </div>
          <BalanceChart days={block.days} />
        </div>
      )}

      <div className="p-6 border-b border-gray-100">
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          Разрывы ({block.gaps.length})
        </h4>
        {!hasGaps ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-700">✅ Разрывов не прогнозируется</p>
          </div>
        ) : (
          <div className="space-y-3">
            {block.gaps.map((gap, idx) => (
              <GapCard key={idx} gap={gap} />
            ))}
          </div>
        )}
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700">
            Дни с движениями ({daysWithItems.length})
          </h4>
          <button
            onClick={() => setShowAllDays(!showAllDays)}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            {showAllDays ? 'Скрыть пустые' : 'Показать все дни'}
          </button>
        </div>

        <DaysTable
          days={showAllDays ? block.days : daysWithItems}
          expandedDay={expandedDay}
          setExpandedDay={setExpandedDay}
          emptyDays={!showAllDays}
        />
      </div>
    </div>
  );
}

// ============================================
// Карточка
// ============================================

function StatCard({
  label,
  value,
  color = 'gray',
}: {
  label: string;
  value: string;
  color?: 'green' | 'red' | 'gray';
}) {
  const colorClass =
    color === 'green'
      ? 'text-green-600'
      : color === 'red'
        ? 'text-red-600'
        : 'text-gray-900';
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${colorClass}`}>{value}</p>
    </div>
  );
}

// ============================================
// Легенда
// ============================================

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-500">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-0.5 bg-green-500"></span>
        <span>остаток ≥ 0</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-0.5 bg-red-500"></span>
        <span>остаток &lt; 0</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-0.5 bg-red-400" style={{ borderTop: '2px dashed #EF4444', height: 0 }}></span>
        <span>ноль</span>
      </div>
    </div>
  );
}

// ============================================
// График (улучшенный)
// ============================================

function BalanceChart({ days }: { days: ForecastDay[] }) {
  const W = 900;
  const H = 260;
  const PAD_L = 70;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 40;

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // Range
  const balances = days.map(d => d.balance_end);
  const rawMin = Math.min(...balances, 0);
  const rawMax = Math.max(...balances, 1);

  // Округляем до красивых значений
  const min = Math.floor(rawMin / 1_000_000) * 1_000_000 - 1_000_000;
  const max = Math.ceil(rawMax / 1_000_000) * 1_000_000 + 1_000_000;
  const range = max - min || 1;

  const xFor = (i: number) =>
    PAD_L + (i / Math.max(1, days.length - 1)) * chartW;
  const yFor = (v: number) =>
    PAD_T + (1 - (v - min) / range) * chartH;

  const zeroY = yFor(0);

  // Точки
  const points = days.map((d, i) => ({
    x: xFor(i),
    y: yFor(d.balance_end),
    day: d,
  }));

  // Сегменты по знаку
  const segments: Array<{ positive: boolean; points: Array<{ x: number; y: number }> }> = [];
  let currentSegment: { positive: boolean; points: Array<{ x: number; y: number }> } | null = null;

  for (const p of points) {
    const isPositive = p.day.balance_end >= 0;
    if (!currentSegment || currentSegment.positive !== isPositive) {
      currentSegment = { positive: isPositive, points: [p] };
      segments.push(currentSegment);
    } else {
      currentSegment.points.push(p);
    }
  }

  // Найти первый разрыв
  const firstGapIdx = days.findIndex(d => d.is_gap);

  // Подписи дат — каждые 7 дней
  const dateLabelIndices: number[] = [];
  for (let i = 0; i < days.length; i += 7) {
    dateLabelIndices.push(i);
  }
  if (dateLabelIndices[dateLabelIndices.length - 1] !== days.length - 1) {
    dateLabelIndices.push(days.length - 1);
  }

  // Y-сетка — 5 уровней
  const yGridCount = 5;
  const yGridValues: number[] = [];
  for (let i = 0; i < yGridCount; i++) {
    yGridValues.push(min + (range * i) / (yGridCount - 1));
  }
  // Убираем близкие к 0
  const filteredGrid = yGridValues.filter(v => Math.abs(v) > range * 0.03);

  // Hover state
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}>
        {/* Y-сетка */}
        {filteredGrid.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              y1={yFor(v)}
              x2={W - PAD_R}
              y2={yFor(v)}
              stroke="#F3F4F6"
              strokeWidth="1"
            />
            <text
              x={PAD_L - 8}
              y={yFor(v) + 4}
              textAnchor="end"
              fontSize="10"
              fill="#9CA3AF"
            >
              {fmtCompact(v)}
            </text>
          </g>
        ))}

        {/* Нулевая линия */}
        <line
          x1={PAD_L}
          y1={zeroY}
          x2={W - PAD_R}
          y2={zeroY}
          stroke="#EF4444"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.6"
        />

        {/* Сегменты */}
        {segments.map((seg, idx) => {
          if (seg.points.length === 0) return null;
          const d = seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          const color = seg.positive ? '#10B981' : '#EF4444';
          return <path key={idx} d={d} fill="none" stroke={color} strokeWidth="2" />;
        })}

        {/* Точки при hover */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hover?.idx === i ? 5 : 0}
            fill="#3B82F6"
            stroke="#fff"
            strokeWidth="2"
            style={{ transition: 'r 0.1s' }}
          />
        ))}

        {/* Invisible клики для hover */}
        {points.map((p, i) => (
          <rect
            key={`hit-${i}`}
            x={p.x - chartW / days.length / 2}
            y={PAD_T}
            width={chartW / days.length}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHover({ idx: i, x: p.x, y: p.y })}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'crosshair' }}
          />
        ))}

        {/* Маркер первого разрыва */}
        {firstGapIdx >= 0 && (
          <>
            <circle
              cx={points[firstGapIdx].x}
              cy={points[firstGapIdx].y}
              r="6"
              fill="#EF4444"
              stroke="#fff"
              strokeWidth="2"
            />
            <text
              x={points[firstGapIdx].x}
              y={points[firstGapIdx].y - 12}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#DC2626"
            >
              ⚠ разрыв
            </text>
          </>
        )}

        {/* Подписи дат */}
        {dateLabelIndices.map((i, idx) => (
          <text
            key={idx}
            x={points[i].x}
            y={H - PAD_B + 15}
            textAnchor="middle"
            fontSize="10"
            fill="#6B7280"
          >
            {fmtDateShort(points[i].day.date)}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hover && (
        <div
          className="absolute bg-gray-900 text-white text-xs rounded-lg px-3 py-2 pointer-events-none shadow-lg z-10"
          style={{
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: 'translate(-50%, -110%)',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="font-medium mb-1">{fmtDate(hover.day.date)}</div>
          <div>Остаток: {fmtMoney(hover.day.balance_end)}</div>
          {hover.day.items.length > 0 && (
            <div className="mt-1 pt-1 border-t border-gray-700 text-xs text-gray-300">
              {hover.day.items.length} операций
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Карточка разрыва (с компанией)
// ============================================

function GapCard({ gap }: { gap: ForecastGap }) {
  return (
    <div className="border border-red-200 bg-red-50 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-red-900">
            {fmtDate(gap.date)}
            {gap.duration_days > 1 && ` — ${fmtDate(gap.end_date)}`}
          </p>
          <p className="text-xs text-red-600 mt-0.5">
            {gap.duration_days === 1 ? '1 день' : `${gap.duration_days} дн.`}
          </p>
        </div>
        <span className="text-sm font-bold text-red-700">
          −{Math.round(gap.max_deficit).toLocaleString('ru-RU')} ₽
        </span>
      </div>

      {gap.reasons.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-red-900 mb-1">Крупные выбытия:</p>
          <ul className="text-xs text-red-700 space-y-0.5">
            {gap.reasons.map((r, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span>
                  • {r.description}
                  {r.company_name && (
                    <span className="text-red-500"> [{r.company_name}]</span>
                  )}
                </span>
                <span className="font-medium">
                  −{Math.abs(Math.round(r.amount)).toLocaleString('ru-RU')} ₽
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {gap.recommendations.length > 0 && (
        <div className="pt-2 border-t border-red-200">
          <p className="text-xs font-medium text-red-900 mb-1">Рекомендации:</p>
          <ul className="text-xs text-red-700 space-y-0.5">
            {gap.recommendations.map((r, idx) => (
              <li key={idx}>• {r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================
// Таблица по дням
// ============================================

function DaysTable({
  days,
  expandedDay,
  setExpandedDay,
  emptyDays,
}: {
  days: ForecastDay[];
  expandedDay: string | null;
  setExpandedDay: (d: string | null) => void;
  emptyDays: boolean;
}) {
  if (days.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-4">
        {emptyDays ? 'Нет движений за период' : 'Нет данных'}
      </p>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Дата</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Остаток нач.</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Поступления</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Выбытия</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Остаток кон.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {days.map(day => {
            const isExpanded = expandedDay === day.date;
            const hasItems = day.items.length > 0;
            return (
              <React.Fragment key={day.date}>
                <tr
                  className={`${hasItems ? 'cursor-pointer hover:bg-gray-50' : ''} ${
                    day.is_gap ? 'bg-red-50' : ''
                  }`}
                  onClick={() => hasItems && setExpandedDay(isExpanded ? null : day.date)}
                >
                  <td className="px-3 py-2 text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      {hasItems && (
                        <span className="text-gray-400 text-xs">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      )}
                      {fmtDate(day.date)}
                      {day.is_gap && (
                        <span className="text-xs text-red-600 font-medium">⚠ разрыв</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm text-right text-gray-600">
                    {Math.round(day.balance_start).toLocaleString('ru-RU')}
                  </td>
                  <td className="px-3 py-2 text-sm text-right text-green-600">
                    {day.inflow > 0 ? `+${Math.round(day.inflow).toLocaleString('ru-RU')}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-sm text-right text-red-600">
                    {day.outflow > 0 ? `−${Math.round(day.outflow).toLocaleString('ru-RU')}` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-sm text-right font-medium ${
                    day.balance_end < 0 ? 'text-red-600' : 'text-gray-900'
                  }`}>
                    {Math.round(day.balance_end).toLocaleString('ru-RU')}
                  </td>
                </tr>
                {isExpanded && hasItems && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 bg-gray-50">
                      <div className="space-y-1">
                        {day.items.map(item => (
                          <div key={item.id} className="flex justify-between text-xs py-1">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                                item.type === 'tax'
                                  ? 'bg-red-100 text-red-700'
                                  : item.source === 'plan'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-gray-100 text-gray-600'
                              }`}>
                                {item.type === 'tax' ? 'налог' : item.source === 'plan' ? 'план' : 'факт'}
                              </span>
                              <span className="text-gray-900">{item.description}</span>
                              {item.company_name && (
                                <span className="text-gray-500">[{item.company_name}]</span>
                              )}
                            </div>
                            <span className={`font-medium ${
                              item.direction === 'inflow' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {item.direction === 'inflow' ? '+' : '−'}
                              {Math.abs(Math.round(item.amount)).toLocaleString('ru-RU')} ₽
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
