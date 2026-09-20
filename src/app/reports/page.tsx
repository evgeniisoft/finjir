"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatMonth, formatWeek, formatDay } from "@/lib/utils/dateFormat";
import {
  getPeriodRange,
  getLastMonthRange,
  getLastYearRange,
  type PeriodType,
} from "@/lib/utils/period";

export default function ReportsPage() {
  // ============================================
  // STATE
  // ============================================
  const [activeTab, setActiveTab] = useState<
    "pnl" | "cashflow" | "balance" | "calendar" | "gaps"
  >("pnl");
  const [viewMode, setViewMode] = useState<"consolidated" | "by_company">(
    "consolidated",
  );
  const [periodType, setPeriodType] = useState<
    "monthly" | "weekly" | "daily" | "quarterly"
  >("monthly");
  const [showPeriods, setShowPeriods] = useState(false);
  const [settings, setSettings] = useState<any[]>([]);

  const defaultPeriod = getPeriodRange("month");
  const [period, setPeriod] = useState({
    start: defaultPeriod.start,
    end: defaultPeriod.end,
  });
  const [activePreset, setActivePreset] = useState<string>("current_month");

  // Данные
  const [reports, setReports] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [drilldownData, setDrilldownData] = useState<any[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [activeDrilldown, setActiveDrilldown] = useState<string | null>(null);

  // ============================================
  // EFFECTS
  // ============================================
  useEffect(() => {
    loadData();
  }, [activeTab, viewMode, showPeriods, periodType, period.start, period.end]);

  // ============================================
  // LOAD DATA
  // ============================================
  const loadData = async () => {
    try {
      setLoading(true);

      const [accountsData, companiesData, counterpartiesData, settingsData] =
        await Promise.all([
          api.getAll("Accounts"),
          api.getAll("Companies"),
          api.getAll("Counterparties"),
          api.getAll("Settings"),
        ]);
      setAccounts(accountsData);
      setCompanies(companiesData);
      setCounterparties(counterpartiesData);
      setSettings(settingsData);

      if (activeTab === "calendar" || activeTab === "gaps") {
        const txData = await api.getAll("Transactions");
        setTransactions(Array.isArray(txData) ? txData : []);
        setLoading(false);
        return;
      }

      if (showPeriods) {
        if (viewMode === "consolidated") {
          const monthlyUrl = `/api/reports/monthly?period_start=${period.start}&period_end=${period.end}&period_type=${periodType}&report_type=${activeTab === "pnl" ? "pnl" : activeTab === "cashflow" ? "cashflow" : "balance"}`;
          const monthlyResponse = await fetch(monthlyUrl);
          const monthlyResult = await monthlyResponse.json();
          setMonthlyData(
            Array.isArray(monthlyResult.periods) ? monthlyResult.periods : [],
          );
        } else {
          const companiesForMonthly =
            companiesData.length > 0
              ? companiesData
              : await api.getAll("Companies");
          const allMonthly: any[] = [];
          for (const company of companiesForMonthly) {
            const monthlyUrl = `/api/reports/monthly?company_id=${company.id}&period_start=${period.start}&period_end=${period.end}&period_type=${periodType}&report_type=${activeTab === "pnl" ? "pnl" : activeTab === "cashflow" ? "cashflow" : "balance"}`;
            const monthlyResponse = await fetch(monthlyUrl);
            const monthlyResult = await monthlyResponse.json();
            const periods = Array.isArray(monthlyResult.periods)
              ? monthlyResult.periods
              : [];
            allMonthly.push({ company, periods });
          }
          setMonthlyData(allMonthly);
        }
        setLoading(false);
        return;
      }

      let url;
      if (viewMode === "consolidated") {
        url = `/api/reports?type=consolidated&period_start=${period.start}&period_end=${period.end}`;
      } else {
        url = `/api/reports?type=${activeTab}&period_start=${period.start}&period_end=${period.end}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (viewMode === "consolidated") {
        setReports(data);
      } else {
        setReports(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Ошибка загрузки:", error);
      setReports(null);
      setMonthlyData([]);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // DRILLDOWN
  // ============================================
  const loadDrilldown = async (
    rowId: string,
    rowType?: string,
    companyId?: string,
  ) => {
    if (activeDrilldown === rowId && drilldownData.length > 0) {
      setActiveDrilldown(null);
      setDrilldownData([]);
      return;
    }

    try {
      setDrilldownLoading(true);
      setActiveDrilldown(rowId);

      if (
        rowId === "gross" ||
        rowId === "net" ||
        rowId === "profit" ||
        rowId === "total_income" ||
        rowId === "total_expense" ||
        rowId === "start" ||
        rowId === "end" ||
        rowId === "total_assets" ||
        rowId === "total_liab" ||
        rowId === "equity" ||
        rowId === "op_header" ||
        rowId === "inv_header" ||
        rowId === "fin_header" ||
        rowId === "op_out_total" ||
        rowId === "assets_header" ||
        rowId === "liab_header" ||
        rowId === "equity_header"
      ) {
        setDrilldownData([]);
        setDrilldownLoading(false);
        return;
      }

      let accountId = "";
      let typeParam = "all";
      const companyParam = companyId ? `&company_id=${companyId}` : "";

      switch (rowId) {
        case "revenue":
          typeParam = "income";
          break;
        case "cogs":
          typeParam = "cogs";
          break;
        case "opex":
          typeParam = "opex";
          break;
        case "insurance":
          accountId = "acc-tax-insurance";
          typeParam = "expense";
          break;
        case "ndfl":
          accountId = "acc-tax-ndfl";
          typeParam = "expense";
          break;
        case "depreciation":
          accountId = "acc-depreciation-os";
          typeParam = "expense";
          break;
        case "taxes":
          accountId = "acc-tax-usn";
          typeParam = "expense";
          break;
        case "op_in":
          typeParam = "cash_in_operating";
          break;
        case "op_out":
          typeParam = "cash_out_operating";
          break;
        case "inv_in":
          typeParam = "cash_in_investing";
          break;
        case "inv_out":
          typeParam = "cash_out_investing";
          break;
        case "fin_in":
          typeParam = "cash_in_financing";
          break;
        case "fin_out":
          typeParam = "cash_out_financing";
          break;
        case "start":
        case "end":
          setDrilldownData([]);
          setDrilldownLoading(false);
          return;
        default:
          if (rowId.startsWith("acc-")) {
            accountId = rowId;
            typeParam = rowType || "all";
          } else {
            typeParam = rowType || "all";
          }
      }

      const drilldownUrl = `/api/reports/drilldown?account_id=${accountId}&type=${typeParam}&period_start=${period.start}&period_end=${period.end}${companyParam}`;
      const response = await fetch(drilldownUrl);
      const data = await response.json();

      setDrilldownData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Ошибка drill-down:", error);
    } finally {
      setDrilldownLoading(false);
    }
  };

  // ============================================
  // PERIOD PRESETS
  // ============================================
  const applyPreset = (
    presetId: "current_month" | "last_month" | "current_year" | "last_year",
  ) => {
    let range;
    switch (presetId) {
      case "current_month":
        range = getPeriodRange("month");
        break;
      case "last_month":
        range = getLastMonthRange();
        break;
      case "current_year":
        range = getPeriodRange("year");
        break;
      case "last_year":
        range = getLastYearRange();
        break;
    }
    setPeriod({ start: range.start, end: range.end });
    setActivePreset(presetId);
  };

  // ============================================
  // TABS
  // ============================================
  const tabs = [
    { id: "pnl", label: "ОПиУ (P&L)" },
    { id: "cashflow", label: "ДДС (Cash Flow)" },
    { id: "balance", label: "Баланс" },
    { id: "calendar", label: "Платёжный календарь" },
    { id: "gaps", label: "Кассовые разрывы" },
  ];

  // ============================================
  // RENDER
  // ============================================
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Отчёты</h2>
        <p className="text-gray-500 mt-1">Финансовые отчёты холдинга</p>
      </div>

      {/* Панель фильтров */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => applyPreset("current_month")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activePreset === "current_month"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Текущий месяц
            </button>
            <button
              onClick={() => applyPreset("last_month")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activePreset === "last_month"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Прошлый месяц
            </button>
            <button
              onClick={() => applyPreset("current_year")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activePreset === "current_year"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Текущий год
            </button>
            <button
              onClick={() => applyPreset("last_year")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activePreset === "last_year"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Прошлый год
            </button>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={period.start}
              onChange={(e) => {
                setPeriod({ ...period, start: e.target.value });
                setActivePreset("custom");
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
            <span className="text-gray-400">—</span>
            <input
              type="date"
              value={period.end}
              onChange={(e) => {
                setPeriod({ ...period, end: e.target.value });
                setActivePreset("custom");
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
            <button
              onClick={loadData}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Применить
            </button>
          </div>
        </div>
      </div>

      {/* Переключатель вида */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => setViewMode("consolidated")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === "consolidated" ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
        >
          Консолидированный
        </button>
        <button
          onClick={() => setViewMode("by_company")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === "by_company" ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
        >
          По компаниям
        </button>
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setShowPeriods(false);
            }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {tab.label}
          </button>
        ))}

        {(activeTab === "pnl" ||
          activeTab === "cashflow" ||
          activeTab === "balance") && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowPeriods(!showPeriods)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${showPeriods ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              {showPeriods ? "Скрыть по периодам" : "По периодам"}
            </button>
            {showPeriods && (
              <>
                {activeTab === "pnl" && (
                  <>
                    <button
                      onClick={() => setPeriodType("monthly")}
                      className={`px-3 py-1.5 rounded-lg text-xs ${periodType === "monthly" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
                    >
                      Месяцы
                    </button>
                    <button
                      onClick={() => setPeriodType("quarterly" as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs ${periodType === "quarterly" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
                    >
                      Кварталы
                    </button>
                  </>
                )}
                {activeTab === "cashflow" && (
                  <>
                    <button
                      onClick={() => setPeriodType("daily")}
                      className={`px-3 py-1.5 rounded-lg text-xs ${periodType === "daily" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
                    >
                      Дни
                    </button>
                    <button
                      onClick={() => setPeriodType("weekly")}
                      className={`px-3 py-1.5 rounded-lg text-xs ${periodType === "weekly" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
                    >
                      Недели
                    </button>
                    <button
                      onClick={() => setPeriodType("monthly")}
                      className={`px-3 py-1.5 rounded-lg text-xs ${periodType === "monthly" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
                    >
                      Месяцы
                    </button>
                  </>
                )}
                {activeTab === "balance" && (
                  <>
                    <button
                      onClick={() => setPeriodType("monthly")}
                      className={`px-3 py-1.5 rounded-lg text-xs ${periodType === "monthly" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
                    >
                      Месяцы
                    </button>
                    <button
                      onClick={() => setPeriodType("quarterly" as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs ${periodType === "quarterly" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
                    >
                      Кварталы
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Контент */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {showPeriods &&
            (activeTab === "pnl" ||
              activeTab === "cashflow" ||
              activeTab === "balance") && (
              <>
                {viewMode === "consolidated" && (
                  <MonthlyTableView
                    data={monthlyData}
                    type={activeTab}
                    periodType={periodType}
                    accounts={accounts}
                    onDrilldown={loadDrilldown}
                    drilldownData={drilldownData}
                    drilldownLoading={drilldownLoading}
                    activeDrilldown={activeDrilldown}
                  />
                )}
                {viewMode === "by_company" &&
                  Array.isArray(monthlyData) &&
                  monthlyData.map((item: any) => (
                    <div key={item.company?.id || Math.random()}>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">
                        {item.company?.name}
                      </h3>
                      <MonthlyTableView
                        data={item.periods || []}
                        type={activeTab}
                        periodType={periodType}
                        accounts={accounts}
                        onDrilldown={loadDrilldown}
                        drilldownData={drilldownData}
                        drilldownLoading={drilldownLoading}
                        activeDrilldown={activeDrilldown}
                      />
                    </div>
                  ))}
              </>
            )}

          {!showPeriods && (
            <>
              {viewMode === "consolidated" &&
                reports &&
                activeTab !== "calendar" &&
                activeTab !== "gaps" && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Холдинг (консолидированный)
                    </h3>
                    {activeTab === "pnl" && reports.pnl && (
                      <PnlView
                        data={reports.pnl}
                        expandedRow={expandedRow}
                        setExpandedRow={setExpandedRow}
                        onDrilldown={loadDrilldown}
                        drilldownData={drilldownData}
                        drilldownLoading={drilldownLoading}
                        activeDrilldown={activeDrilldown}
                      />
                    )}
                    {activeTab === "cashflow" && reports.cashFlow && (
                      <CashFlowView
                        data={reports.cashFlow}
                        expandedRow={expandedRow}
                        setExpandedRow={setExpandedRow}
                        onDrilldown={loadDrilldown}
                        drilldownData={drilldownData}
                        drilldownLoading={drilldownLoading}
                        activeDrilldown={activeDrilldown}
                      />
                    )}
                    {activeTab === "balance" && reports.balance && (
                      <BalanceView
                        data={reports.balance}
                        onDrilldown={loadDrilldown}
                      />
                    )}
                  </div>
                )}

              {viewMode === "by_company" &&
                Array.isArray(reports) &&
                activeTab !== "calendar" &&
                activeTab !== "gaps" &&
                reports
                  .filter(
                    (r: any, i: number, self: any[]) =>
                      self.findIndex((x) => x.company?.id === r.company?.id) ===
                      i,
                  )
                  .map((report: any) => (
                    <div
                      key={report.company.id}
                      className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        {report.company.name}
                      </h3>
                      {activeTab === "pnl" && report.report && (
                        <PnlView
                          data={{
                            ...report.report,
                            company_id: report.company.id,
                          }}
                          company={report.company}
                          expandedRow={expandedRow}
                          setExpandedRow={setExpandedRow}
                          onDrilldown={loadDrilldown}
                          drilldownData={drilldownData}
                          drilldownLoading={drilldownLoading}
                          activeDrilldown={activeDrilldown}
                        />
                      )}
                      {activeTab === "cashflow" && report.report && (
                        <CashFlowView
                          data={{
                            ...report.report,
                            company_id: report.company.id,
                          }}
                          expandedRow={expandedRow}
                          setExpandedRow={setExpandedRow}
                          onDrilldown={loadDrilldown}
                          drilldownData={drilldownData}
                          drilldownLoading={drilldownLoading}
                          activeDrilldown={activeDrilldown}
                        />
                      )}
                      {activeTab === "balance" && report.report && (
                        <BalanceView
                          data={{
                            ...report.report,
                            company_id: report.company.id,
                          }}
                          onDrilldown={loadDrilldown}
                        />
                      )}
                    </div>
                  ))}

              {activeTab === "calendar" && viewMode === "consolidated" && (
                <CalendarView
                  transactions={transactions}
                  companies={companies}
                  companyId={null}
                  accounts={accounts}
                  counterparties={counterparties}
                  settings={settings}
                />
              )}
              {activeTab === "calendar" &&
                viewMode === "by_company" &&
                companies.map((company: any) => (
                  <CalendarView
                    key={company.id}
                    transactions={transactions}
                    companies={companies}
                    companyId={company.id}
                    accounts={accounts}
                    counterparties={counterparties}
                    settings={settings}
                  />
                ))}

              {activeTab === "gaps" && viewMode === "consolidated" && (
                <CashGapsView
                  transactions={transactions}
                  companies={companies}
                  companyId={null}
                  accounts={accounts}
                  counterparties={counterparties}
                />
              )}
              {activeTab === "gaps" &&
                viewMode === "by_company" &&
                companies.map((company: any) => (
                  <CashGapsView
                    key={company.id}
                    transactions={transactions}
                    companies={companies}
                    companyId={company.id}
                    accounts={accounts}
                    counterparties={counterparties}
                  />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// PNL VIEW
// ============================================
function PnlView({
  data,
  company,
  expandedRow,
  setExpandedRow,
  onDrilldown,
  drilldownData,
  drilldownLoading,
  activeDrilldown,
}: any) {
  const taxSystem = company?.tax_system || "";
  const taxLabel =
    taxSystem === "OSNO"
      ? "Налог на прибыль (ОСНО)"
      : taxSystem === "USN_15"
        ? "Налог УСН 15%"
        : taxSystem === "USN_6"
          ? "Налог УСН 6%"
          : "Налог (УСН/прибыль)";

  const rows = [
    { id: "revenue", label: "Выручка", value: data.revenue, type: "income" },
    {
      id: "cogs",
      label: "Себестоимость",
      value: data.cost_of_goods_sold,
      type: "expense",
    },
    {
      id: "gross",
      label: "Валовая прибыль",
      value: data.gross_profit,
      type: "total",
      bold: true,
    },
    {
      id: "opex",
      label: "Операционные расходы",
      value: data.operating_expenses,
      type: "expense",
    },
    {
      id: "insurance",
      label: "Страховые взносы",
      value: data.insurance_amount || 0,
      type: "expense",
    },
    {
      id: "ndfl",
      label: "НДФЛ",
      value: data.ndfl_amount || 0,
      type: "expense",
    },
    {
      id: "depreciation",
      label: "Амортизация",
      value: data.depreciation,
      type: "expense",
    },
    { id: "taxes", label: taxLabel, value: data.taxes, type: "expense" },
    {
      id: "net",
      label: "Чистая прибыль",
      value: data.net_profit,
      type: "total",
      bold: true,
      green: true,
    },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id}>
          <div
            className="flex justify-between items-center cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
            onClick={() => {
              setExpandedRow(expandedRow === row.id ? null : row.id);
              if (onDrilldown)
                onDrilldown(
                  row.id,
                  row.type === "expense" ? "expense" : "income",
                  data.company_id,
                );
            }}
          >
            <span
              className={`text-sm ${row.bold ? "font-semibold text-gray-900" : "text-gray-600"}`}
            >
              {row.label}
            </span>
            <span
              className={`text-sm ${row.bold ? "font-bold" : "font-medium"} ${row.green ? "text-green-600" : row.type === "expense" ? "text-red-600" : "text-gray-900"}`}
            >
              {Math.round(row.value || 0).toLocaleString("ru-RU")} ₽
            </span>
          </div>
          {expandedRow === row.id && (
            <DrilldownPanel
              data={drilldownData}
              loading={drilldownLoading}
              active={activeDrilldown === row.id}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================
// CASH FLOW VIEW
// ============================================
function CashFlowView({
  data,
  expandedRow,
  setExpandedRow,
  onDrilldown,
  drilldownData,
  drilldownLoading,
  activeDrilldown,
}: any) {
  const rows = [
    {
      id: "start",
      label: "Остаток на начало",
      value: data.starting_balance,
      type: "start",
    },
    {
      id: "op_in",
      label: "Поступления (операционные)",
      value: data.operating_inflow,
      type: "income",
    },
    {
      id: "op_out",
      label: "Выбытия (операционные)",
      value: data.operating_outflow,
      type: "expense",
    },
    {
      id: "tax_out",
      label: "Налоговые выбытия",
      value: data.tax_outflow || 0,
      type: "expense",
    },
    {
      id: "inv_in",
      label: "Инвестиционные поступления",
      value: data.investing_inflow,
      type: "income",
    },
    {
      id: "inv_out",
      label: "Инвестиционные выбытия",
      value: data.investing_outflow,
      type: "expense",
    },
    {
      id: "fin_in",
      label: "Финансовые поступления",
      value: data.financing_inflow,
      type: "income",
    },
    {
      id: "fin_out",
      label: "Финансовые выбытия",
      value: data.financing_outflow,
      type: "expense",
    },
    {
      id: "end",
      label: "Остаток на конец",
      value: data.ending_balance,
      type: "end",
      bold: true,
    },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id}>
          <div
            className="flex justify-between items-center cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
            onClick={() => {
              setExpandedRow(expandedRow === row.id ? null : row.id);
              if (onDrilldown)
                onDrilldown(
                  row.id,
                  row.type === "expense"
                    ? "expense"
                    : row.type === "income"
                      ? "income"
                      : "all",
                  data.company_id,
                );
            }}
          >
            <span
              className={`text-sm ${row.bold ? "font-semibold text-gray-900" : "text-gray-600"}`}
            >
              {row.label}
            </span>
            <span
              className={`text-sm ${row.bold ? "font-bold" : "font-medium"} ${row.type === "income" ? "text-green-600" : row.type === "expense" ? "text-red-600" : "text-gray-900"}`}
            >
              {Math.round(row.value || 0).toLocaleString("ru-RU")} ₽
            </span>
          </div>
          {expandedRow === row.id && (
            <DrilldownPanel
              data={drilldownData}
              loading={drilldownLoading}
              active={activeDrilldown === row.id}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================
// BALANCE VIEW
// ============================================
function BalanceView({ data, onDrilldown }: any) {
  const assetRows = [
    {
      id: "cash",
      label: "Деньги",
      value: data.assets?.cash,
      accountId: "acc-bank-001",
    },
    {
      id: "ar",
      label: "Дебиторская задолженность",
      value: data.assets?.accounts_receivable,
      accountId: "acc-ar-001",
    },
    {
      id: "inventory",
      label: "Запасы",
      value: data.assets?.inventory,
      accountId: "inventory",
    },
    {
      id: "fa",
      label: "Основные средства",
      value: data.assets?.fixed_assets,
      accountId: "fixed_assets",
    },
  ];

  const liabilityRows = [
    {
      id: "ap",
      label: "Кредиторская задолженность",
      value: data.liabilities?.accounts_payable,
      accountId: "acc-ap-001",
    },
    {
      id: "loans",
      label: "Кредиты",
      value: data.liabilities?.loans,
      accountId: "acc-loan-001",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Активы</h4>
        {assetRows.map((row) => (
          <div
            key={row.id}
            className="flex justify-between px-2 py-1 cursor-pointer hover:bg-gray-50 rounded"
            onClick={() =>
              onDrilldown && onDrilldown(row.accountId, "all", data.company_id)
            }
          >
            <span className="text-sm text-gray-600">{row.label}</span>
            <span className="text-sm font-medium text-gray-900">
              {Math.round(row.value || 0).toLocaleString("ru-RU")} ₽
            </span>
          </div>
        ))}
        <div className="flex justify-between px-2 py-1 border-t mt-2">
          <span className="text-sm font-semibold">Итого активы</span>
          <span className="text-sm font-bold">
            {Math.round(data.assets?.total || 0).toLocaleString("ru-RU")} ₽
          </span>
        </div>
      </div>
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Пассивы</h4>
        {liabilityRows.map((row) => (
          <div
            key={row.id}
            className="flex justify-between px-2 py-1 cursor-pointer hover:bg-gray-50 rounded"
            onClick={() =>
              onDrilldown && onDrilldown(row.accountId, "all", data.company_id)
            }
          >
            <span className="text-sm text-gray-600">{row.label}</span>
            <span className="text-sm font-medium text-red-600">
              {Math.round(row.value || 0).toLocaleString("ru-RU")} ₽
            </span>
          </div>
        ))}
        <div className="flex justify-between px-2 py-1 border-t mt-2">
          <span className="text-sm font-semibold">Итого пассивы</span>
          <span className="text-sm font-bold text-red-600">
            {Math.round(data.liabilities?.total || 0).toLocaleString("ru-RU")} ₽
          </span>
        </div>
      </div>
      <div className="border-t pt-4">
        <div className="flex justify-between px-2 py-1">
          <span className="text-sm text-gray-600">Уставный капитал</span>
          <span className="text-sm font-medium text-gray-900">
            {Math.round(data.equity?.capital || 0).toLocaleString("ru-RU")} ₽
          </span>
        </div>
        <div className="flex justify-between px-2 py-1">
          <span className="text-sm text-gray-600">
            Нераспределённая прибыль
          </span>
          <span className="text-sm font-medium text-green-600">
            {Math.round(data.equity?.retained_earnings || 0).toLocaleString(
              "ru-RU",
            )}{" "}
            ₽
          </span>
        </div>
        <div className="flex justify-between px-2 py-1 border-t mt-2">
          <span className="text-sm font-semibold">Итого капитал</span>
          <span className="text-sm font-bold text-green-600">
            {Math.round(data.equity?.total || 0).toLocaleString("ru-RU")} ₽
          </span>
        </div>
        <div className="flex justify-between px-2 py-1 border-t mt-2">
          <span className="text-sm font-semibold">Итого пассивы + капитал</span>
          <span className="text-sm font-bold text-gray-900">
            {Math.round(
              (data.liabilities?.total || 0) + (data.equity?.total || 0),
            ).toLocaleString("ru-RU")}{" "}
            ₽
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// DRILLDOWN PANEL
// ============================================
function DrilldownPanel({ data, loading, active }: any) {
  if (!active) return null;

  return (
    <div className="ml-6 mt-2 p-3 bg-gray-50 rounded-lg">
      {loading ? (
        <p className="text-sm text-gray-500">Загрузка...</p>
      ) : data && data.length > 0 ? (
        <div className="space-y-2 max-h-60 overflow-auto">
          {data.slice(0, 20).map((op: any) => (
            <div key={op.id} className="flex justify-between text-sm">
              <span className="text-gray-600">
                {formatDay(op.date)} — {op.description}
              </span>
              <span className="font-medium text-gray-900">
                {parseFloat(op.amount)?.toLocaleString("ru-RU")} {op.currency}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Нет операций по этой статье</p>
      )}
    </div>
  );
}

// ============================================
// MONTHLY TABLE VIEW
// ============================================
function MonthlyTableView({
  data,
  type,
  periodType,
  accounts,
  onDrilldown,
  drilldownData,
  drilldownLoading,
  activeDrilldown,
}: any) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-500">Нет данных за выбранный период</p>
      </div>
    );
  }

  const periods = data.map((d: any) => {
    const raw = d.period || d.month || "";
    if (periodType === "monthly") return formatMonth(raw);
    if (periodType === "weekly") return formatWeek(raw);
    if (periodType === "daily") return formatDay(raw);
    if (periodType === "quarterly") return raw;
    return raw;
  });

  const cashAccounts = accounts.filter(
    (a: any) => a.is_cash_flow === "true" || a.is_cash_flow === true,
  );
  const incomeAccounts = accounts.filter(
    (a: any) =>
      a.type === "I" &&
      a.activity_type === "operating" &&
      !a.id.startsWith("acc-in-invest-") &&
      a.id !== "acc-in-loan",
  );

  const expenseAccounts = accounts.filter(
    (a: any) =>
      a.type === "X" &&
      a.activity_type === "operating" &&
      !a.id.startsWith("acc-tax-") &&
      !a.id.startsWith("acc-depreciation-") &&
      a.id !== "acc-out-capex" &&
      !a.id.startsWith("acc-out-loan-") &&
      a.id !== "acc-out-dividends",
  );

  const getRows = () => {
    switch (type) {
      case "pnl": {
        const rows: any[] = [];
        incomeAccounts.forEach((a: any) =>
          rows.push({
            id: a.id,
            label: a.name,
            getValue: (d: any) => d.details?.[a.id] || 0,
            color: "text-gray-900",
            bold: false,
            rowType: "income",
          }),
        );
        rows.push({
          id: "total_income",
          label: "Итого доходы",
          getValue: (d: any) => d.revenue || 0,
          color: "text-gray-900",
          bold: true,
          rowType: "all",
        });
        expenseAccounts.forEach((a: any) =>
          rows.push({
            id: a.id,
            label: a.name,
            getValue: (d: any) => d.details?.[a.id] || 0,
            color: "text-red-600",
            bold: false,
            rowType: "expense",
          }),
        );
        rows.push({
          id: "total_expense",
          label: "Итого расходы",
          getValue: (d: any) => d.expenses || 0,
          color: "text-red-600",
          bold: true,
          rowType: "all",
        });

        rows.push({
          id: "tax_header_pnl",
          label: "Налоги",
          getValue: () => "",
          color: "text-gray-900",
          bold: true,
          rowType: "",
        });
        rows.push({
          id: "tax_insurance_pnl",
          label: "  Страховые взносы",
          getValue: (d: any) => d.details?.["acc-tax-insurance"] || 0,
          color: "text-red-600",
          bold: false,
          rowType: "expense",
        });
        rows.push({
          id: "tax_ndfl_pnl",
          label: "  НДФЛ",
          getValue: (d: any) => d.details?.["acc-tax-ndfl"] || 0,
          color: "text-red-600",
          bold: false,
          rowType: "expense",
        });
        rows.push({
          id: "tax_usn_pnl",
          label: "  Налог УСН",
          getValue: (d: any) => d.details?.["acc-tax-usn"] || 0,
          color: "text-red-600",
          bold: false,
          rowType: "expense",
        });
        rows.push({
          id: "tax_profit_pnl",
          label: "  Налог на прибыль",
          getValue: (d: any) => d.details?.["acc-tax-profit"] || 0,
          color: "text-red-600",
          bold: false,
          rowType: "expense",
        });
        rows.push({
          id: "total_taxes_pnl",
          label: "Итого налоги",
          getValue: (d: any) =>
            (d.details?.["acc-tax-insurance"] || 0) +
            (d.details?.["acc-tax-ndfl"] || 0) +
            (d.details?.["acc-tax-usn"] || 0) +
            (d.details?.["acc-tax-profit"] || 0),
          color: "text-red-600",
          bold: true,
          rowType: "all",
        });

        rows.push({
          id: "profit",
          label: "Прибыль",
          getValue: (d: any) => d.profit || 0,
          color: "text-green-600",
          bold: true,
          rowType: "all",
        });
        return rows;
      }
      case "cashflow": {
        const rows: any[] = [];
        rows.push({
          id: "start",
          label: "Остаток на начало",
          getValue: (d: any) => d.starting_balance || 0,
          color: "text-gray-900",
          bold: false,
          rowType: "all",
        });

        rows.push({
          id: "op_header",
          label: "Операционная деятельность",
          getValue: () => "",
          color: "text-gray-900",
          bold: true,
          rowType: "",
        });

        cashAccounts.forEach((a: any) =>
          rows.push({
            id: `in_${a.id}`,
            label: `  Поступление: ${a.name}`,
            getValue: (d: any) => d.details?.[`in_${a.id}`] || 0,
            color: "text-green-600",
            bold: false,
            rowType: "income",
          }),
        );

        expenseAccounts.forEach((a: any) =>
          rows.push({
            id: a.id,
            label: `  ${a.name}`,
            getValue: (d: any) => d.details?.[a.id] || 0,
            color: "text-red-600",
            bold: false,
            rowType: "expense",
          }),
        );

        rows.push({
          id: "op_out_total",
          label: "  Итого выбытия",
          getValue: (d: any) => d.cash_out || 0,
          color: "text-red-600",
          bold: true,
          rowType: "all",
        });

        rows.push({
          id: "tax_header",
          label: "  Налоговые выбытия",
          getValue: () => "",
          color: "text-gray-900",
          bold: true,
          rowType: "",
        });
        rows.push({
          id: "tax_insurance",
          label: "    Страховые взносы",
          getValue: (d: any) => d.details?.["tax_insurance"] || 0,
          color: "text-red-600",
          bold: false,
          rowType: "expense",
        });
        rows.push({
          id: "tax_ndfl",
          label: "    НДФЛ",
          getValue: (d: any) => d.details?.["tax_ndfl"] || 0,
          color: "text-red-600",
          bold: false,
          rowType: "expense",
        });
        rows.push({
          id: "tax_vat",
          label: "    НДС",
          getValue: (d: any) => d.details?.["tax_vat"] || 0,
          color: "text-red-600",
          bold: false,
          rowType: "expense",
        });
        rows.push({
          id: "tax_income",
          label: "    Налог на прибыль / УСН",
          getValue: (d: any) => d.details?.["tax_income"] || 0,
          color: "text-red-600",
          bold: false,
          rowType: "expense",
        });
        rows.push({
          id: "tax_total",
          label: "    Итого налоги",
          getValue: (d: any) => {
            const ins = d.details?.["tax_insurance"] || 0;
            const ndfl = d.details?.["tax_ndfl"] || 0;
            const vat = d.details?.["tax_vat"] || 0;
            const inc = d.details?.["tax_income"] || 0;
            return ins + ndfl + vat + inc;
          },
          color: "text-red-600",
          bold: true,
          rowType: "all",
        });
        rows.push({
          id: "inv_header",
          label: "Инвестиционная деятельность",
          getValue: () => "",
          color: "text-gray-900",
          bold: true,
          rowType: "",
        });
        rows.push({
          id: "inv_in",
          label: "  Поступления",
          getValue: (d: any) => d.investing_inflow || 0,
          color: "text-green-600",
          bold: false,
          rowType: "income",
        });
        rows.push({
          id: "inv_out",
          label: "  Выбытия",
          getValue: (d: any) => d.investing_outflow || 0,
          color: "text-red-600",
          bold: false,
          rowType: "expense",
        });

        rows.push({
          id: "fin_header",
          label: "Финансовая деятельность",
          getValue: () => "",
          color: "text-gray-900",
          bold: true,
          rowType: "",
        });
        rows.push({
          id: "fin_in",
          label: "  Поступления",
          getValue: (d: any) => d.financing_inflow || 0,
          color: "text-green-600",
          bold: false,
          rowType: "income",
        });
        rows.push({
          id: "fin_out",
          label: "  Выбытия",
          getValue: (d: any) => d.financing_outflow || 0,
          color: "text-red-600",
          bold: false,
          rowType: "expense",
        });

        rows.push({
          id: "end",
          label: "Остаток на конец",
          getValue: (d: any) => d.ending_balance || 0,
          color: "text-gray-900",
          bold: true,
          rowType: "all",
        });
        return rows;
      }
      case "balance": {
        const rows: any[] = [];
        const assetAccounts = accounts.filter(
          (a: any) => a.type === "A" && !a.is_cash_flow,
        );
        const liabilityAccounts = accounts.filter((a: any) => a.type === "L");
        const equityAccounts = accounts.filter((a: any) => a.type === "E");

        rows.push({
          id: "assets_header",
          label: "АКТИВЫ",
          getValue: () => "",
          color: "text-gray-900",
          bold: true,
          rowType: "",
        });

        cashAccounts.forEach((a: any) =>
          rows.push({
            id: a.id,
            label: `  ${a.name}`,
            getValue: (d: any) => d.details?.[a.id] || 0,
            color: "text-gray-900",
            bold: false,
            rowType: "all",
          }),
        );

        assetAccounts.forEach((a: any) =>
          rows.push({
            id: a.id,
            label: `  ${a.name}`,
            getValue: (d: any) => d.details?.[a.id] || 0,
            color: "text-gray-900",
            bold: false,
            rowType: "all",
          }),
        );

        const totalAssetsValue = (d: any) => {
          let total = 0;
          cashAccounts.forEach((a: any) => (total += d.details?.[a.id] || 0));
          assetAccounts.forEach((a: any) => (total += d.details?.[a.id] || 0));
          return total;
        };

        rows.push({
          id: "total_assets",
          label: "Итого активы",
          getValue: totalAssetsValue,
          color: "text-gray-900",
          bold: true,
          rowType: "all",
        });

        rows.push({
          id: "liab_header",
          label: "ПАССИВЫ",
          getValue: () => "",
          color: "text-gray-900",
          bold: true,
          rowType: "",
        });

        liabilityAccounts.forEach((a: any) =>
          rows.push({
            id: a.id,
            label: `  ${a.name}`,
            getValue: (d: any) => d.details?.[a.id] || 0,
            color: "text-red-600",
            bold: false,
            rowType: "all",
          }),
        );

        rows.push({
          id: "acc-tax-liability",
          label: "  Задолженность по налогам",
          getValue: (d: any) => d.details?.["acc-tax-liability"] || 0,
          color: "text-red-600",
          bold: false,
          rowType: "all",
        });

        const totalLiabValue = (d: any) => {
          let total = 0;
          liabilityAccounts.forEach(
            (a: any) => (total += d.details?.[a.id] || 0),
          );
          total += d.details?.["acc-tax-liability"] || 0;
          return total;
        };

        rows.push({
          id: "total_liab",
          label: "Итого пассивы",
          getValue: totalLiabValue,
          color: "text-red-600",
          bold: true,
          rowType: "all",
        });

        rows.push({
          id: "equity_header",
          label: "КАПИТАЛ",
          getValue: () => "",
          color: "text-gray-900",
          bold: true,
          rowType: "",
        });

        equityAccounts.forEach((a: any) =>
          rows.push({
            id: a.id,
            label: `  ${a.name}`,
            getValue: (d: any) => d.details?.[a.id] || 0,
            color: "text-green-600",
            bold: false,
            rowType: "all",
          }),
        );

        rows.push({
          id: "equity_total",
          label: "Итого капитал",
          getValue: (d: any) => d.profit || 0,
          color: "text-green-600",
          bold: true,
          rowType: "all",
        });
        return rows;
      }
      default:
        return [];
    }
  };

  const rows = getRows();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase sticky left-0 bg-gray-50 z-10">
                Статья
              </th>
              {periods.map((p: string, idx: number) => (
                <th
                  key={idx}
                  className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"
                >
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((row: any, rowIdx: number) => (
              <tr
                key={rowIdx}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() =>
                  onDrilldown && row.rowType && onDrilldown(row.id, row.rowType)
                }
              >
                <td
                  className={`px-4 py-3 text-sm sticky left-0 bg-white ${row.bold ? "font-semibold text-gray-900" : "text-gray-600"}`}
                >
                  {row.label}
                </td>
                {data.map((d: any, dataIdx: number) => {
                  const value = row.getValue(d);
                  if (value === "" || value === null || value === undefined) {
                    return (
                      <td
                        key={dataIdx}
                        className="px-6 py-3 text-sm text-right whitespace-nowrap"
                      ></td>
                    );
                  }
                  return (
                    <td
                      key={dataIdx}
                      className={`px-6 py-3 text-sm text-right whitespace-nowrap ${row.bold ? "font-bold" : "font-medium"} ${row.color}`}
                    >
                      {Math.round(Number(value) || 0).toLocaleString("ru-RU")} ₽
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {activeDrilldown && (
        <div className="p-4 bg-gray-50 border-t">
          <DrilldownPanel
            data={drilldownData}
            loading={drilldownLoading}
            active={true}
          />
        </div>
      )}
    </div>
  );
}
// ============================================
// CASH GAPS VIEW
// ============================================
function CashGapsView({
  transactions,
  companies,
  companyId,
  accounts,
  counterparties,
}: any) {
  const [days, setDays] = useState(12);
  const [periodType, setPeriodType] = useState<"daily" | "weekly" | "monthly">(
    "daily",
  );

  const filteredTx = companyId
    ? transactions.filter((t: any) => t.company_id === companyId)
    : transactions;
  const companyName = companyId
    ? companies.find((c: any) => c.id === companyId)?.name || ""
    : "Консолидированные";

  const periods = getCalendarPeriodsDetailed(
    filteredTx,
    periodType,
    days,
    accounts,
    counterparties,
  );
  const gapPeriods = periods.filter((p: any) => p.balance < 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 overflow-hidden">
      <div className="flex justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {companyName} — Кассовые разрывы
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setPeriodType("daily")}
            className={`px-3 py-1.5 rounded-lg text-xs ${periodType === "daily" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            Дни
          </button>
          <button
            onClick={() => setPeriodType("weekly")}
            className={`px-3 py-1.5 rounded-lg text-xs ${periodType === "weekly" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            Недели
          </button>
          <button
            onClick={() => setPeriodType("monthly")}
            className={`px-3 py-1.5 rounded-lg text-xs ${periodType === "monthly" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            Месяцы
          </button>
        </div>
      </div>

      {gapPeriods.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-green-600 font-medium">
            Кассовых разрывов не прогнозируется
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 font-medium">
              Обнаружено {gapPeriods.length} периодов с отрицательным остатком
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase sticky left-0 bg-gray-50">
                    Период
                  </th>
                  {gapPeriods.map((gap: any) => (
                    <th
                      key={gap.label}
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"
                    >
                      {gap.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 sticky left-0 bg-white">
                    Остаток
                  </td>
                  {gapPeriods.map((gap: any) => (
                    <td
                      key={gap.label}
                      className="px-4 py-3 text-sm text-right font-medium text-red-600 bg-red-50 whitespace-nowrap"
                    >
                      {gap.balance.toLocaleString("ru-RU")} ₽
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// GET CALENDAR PERIODS — с детализацией
// ============================================
function getCalendarPeriodsDetailed(
  transactions: any[],
  periodType: string,
  count: number,
  accounts?: any[],
  counterparties?: any[],
): any[] {
  const today = new Date();
  const periods: any[] = [];

  for (let i = 0; i < count; i++) {
    const date = new Date(today);

    if (periodType === "daily") {
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      const dayTx = transactions.filter((t: any) => {
        const txDate =
          typeof t.date === "string" ? t.date.split("T")[0] : t.date;
        return txDate === dateStr;
      });
      periods.push(
        buildCalendarPeriod(
          formatDay(dateStr),
          dayTx,
          accounts,
          counterparties,
        ),
      );
    } else if (periodType === "weekly") {
      date.setDate(date.getDate() + i * 7);
      const weekStart = date.toISOString().split("T")[0];
      const weekEnd = new Date(date);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split("T")[0];
      const weekTx = transactions.filter((t: any) => {
        const txDate =
          typeof t.date === "string" ? t.date.split("T")[0] : t.date;
        return txDate >= weekStart && txDate <= weekEndStr;
      });
      periods.push(
        buildCalendarPeriod(`${i + 1} нед`, weekTx, accounts, counterparties),
      );
    } else if (periodType === "monthly") {
      date.setMonth(date.getMonth() + i);
      const monthStr = date.toISOString().substring(0, 7);
      const monthTx = transactions.filter((t: any) => {
        const txDate =
          typeof t.date === "string" ? t.date.split("T")[0] : t.date;
        return txDate.startsWith(monthStr);
      });
      periods.push(
        buildCalendarPeriod(
          formatMonth(monthStr),
          monthTx,
          accounts,
          counterparties,
        ),
      );
    }
  }
  return periods;
}

// Helper: строит период с детализацией
function buildCalendarPeriod(
  label: string,
  periodTx: any[],
  accounts?: any[],
  counterparties?: any[],
): any {
  const inflowTransactions = periodTx.filter((t) => t.type === "income");
  const outflowTransactions = periodTx.filter((t) => t.type === "expense");

  const inflow = inflowTransactions.reduce(
    (s, t) => s + parseFloat(t.amount || 0),
    0,
  );
  const outflow = outflowTransactions.reduce(
    (s, t) => s + parseFloat(t.amount || 0),
    0,
  );

  const inflowByCounterparty: { [key: string]: number } = {};
  inflowTransactions.forEach((t) => {
    const cp = counterparties?.find((c: any) => c.id === t.counterparty_id);
    const cpName =
      cp?.name || t.counterparty_name || t.counterparty_id || "Прочие";
    inflowByCounterparty[cpName] =
      (inflowByCounterparty[cpName] || 0) + parseFloat(t.amount || 0);
  });

  const outflowByCategory: { [key: string]: number } = {};
  outflowTransactions.forEach((t) => {
    const acc = accounts?.find((a: any) => a.id === t.debit_account_id);
    const catName =
      acc?.name || t.debit_account_name || t.debit_account_id || "Прочие";
    outflowByCategory[catName] =
      (outflowByCategory[catName] || 0) + parseFloat(t.amount || 0);
  });

  return {
    label,
    inflow,
    outflow,
    balance: inflow - outflow,
    inflow_details: inflowByCounterparty,
    outflow_details: outflowByCategory,
  };
}

// ============================================
// CALENDAR VIEW — Рабочий стол казначея
// ============================================
function CalendarView({
  transactions,
  companies,
  companyId,
  accounts,
  counterparties,
  settings,
}: any) {
  const [showMode, setShowMode] = useState<"upcoming" | "all">("upcoming");
  const [currentBalance, setCurrentBalance] = useState<number>(0);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const loadBalance = async () => {
      try {
        const url = `/api/reports?type=balance&period_start=${today}&period_end=${today}${companyId ? `&company_id=${companyId}` : ""}`;
        const response = await fetch(url);
        const data = await response.json();
        const reports = Array.isArray(data) ? data : [];
        const totalCash = reports.reduce(
          (s: number, r: any) => s + (r.report?.assets?.cash || 0),
          0,
        );
        setCurrentBalance(totalCash);
      } catch (e) {
        console.error("Ошибка загрузки баланса:", e);
        setCurrentBalance(0);
      }
    };
    loadBalance();
  }, [today, companyId]);

  const filteredTx = companyId
    ? transactions.filter((t: any) => t.company_id === companyId)
    : transactions;

  const taxPayments = getTaxPayments(companies, accounts, settings || []);
  const taxPaymentsForCompany = taxPayments.filter(
    (tp) => !companyId || tp.company_id === companyId,
  );
  const allTransactions = [...filteredTx, ...taxPaymentsForCompany];

  const companyName = companyId
    ? companies.find((c: any) => c.id === companyId)?.name || ""
    : "Консолидированный";

  const now = new Date();
  const horizonEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const horizonEndStr = horizonEnd.toISOString().split("T")[0];

  const upcomingTx = allTransactions
    .filter((t: any) => {
      const txDate = typeof t.date === "string" ? t.date.split("T")[0] : t.date;
      return txDate >= today && txDate <= horizonEndStr;
    })
    .sort((a: any, b: any) => {
      const da = typeof a.date === "string" ? a.date.split("T")[0] : a.date;
      const db = typeof b.date === "string" ? b.date.split("T")[0] : b.date;
      return da.localeCompare(db);
    });

  const displayPayments =
    showMode === "upcoming"
      ? upcomingTx.filter((t: any) => t.type === "expense")
      : allTransactions.filter((t: any) => t.type === "expense");

  const displayInflows =
    showMode === "upcoming"
      ? upcomingTx.filter((t: any) => t.type === "income")
      : allTransactions.filter((t: any) => t.type === "income");

  const forecast: any[] = [];
  let runningBalance = currentBalance;

  for (const t of upcomingTx) {
    const txDate = typeof t.date === "string" ? t.date.split("T")[0] : t.date;
    const amount = parseFloat(t.amount || 0);
    if (t.type === "income") runningBalance += amount;
    if (t.type === "expense") runningBalance -= amount;

    forecast.push({
      date: txDate,
      description: t.description || "",
      type: t.type,
      amount,
      balance_after: runningBalance,
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {companyName} — Платёжный календарь
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Текущий остаток:{" "}
              <span className="font-semibold text-gray-900">
                {currentBalance.toLocaleString("ru-RU")} ₽
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowMode("upcoming")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${showMode === "upcoming" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              Предстоящие
            </button>
            <button
              onClick={() => setShowMode("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${showMode === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              Все операции
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        <div className="p-6">
          <h4 className="text-sm font-semibold text-red-600 mb-4">
            ПРЕДСТОЯЩИЕ ПЛАТЕЖИ ({displayPayments.length})
          </h4>
          {displayPayments.length === 0 ? (
            <p className="text-sm text-gray-400">Нет предстоящих платежей</p>
          ) : (
            <div className="space-y-3">
              {displayPayments.slice(0, 10).map((t: any, idx: number) => {
                const txDate =
                  typeof t.date === "string" ? t.date.split("T")[0] : t.date;
                const cp = counterparties?.find(
                  (c: any) => c.id === t.counterparty_id,
                );
                const amount = parseFloat(t.amount || 0);

                return (
                  <div
                    key={idx}
                    className="flex items-start justify-between p-3 bg-red-50/50 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {txDate.substring(8, 10)}.{txDate.substring(5, 7)} —{" "}
                        {t.description ||
                          t.debit_account_name ||
                          t.debit_account_id ||
                          "Платёж"}
                      </p>
                      {cp?.name && (
                        <p className="text-xs text-gray-500">{cp.name}</p>
                      )}
                      {t.company_name && !cp?.name && (
                        <p className="text-xs text-gray-400">
                          {t.company_name}
                        </p>
                      )}
                      {t.is_tax && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                          Обязательный
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-red-600 whitespace-nowrap">
                      -{amount.toLocaleString("ru-RU")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6">
          <h4 className="text-sm font-semibold text-green-600 mb-4">
            ПРЕДСТОЯЩИЕ ПОСТУПЛЕНИЯ ({displayInflows.length})
          </h4>
          {displayInflows.length === 0 ? (
            <p className="text-sm text-gray-400">Нет предстоящих поступлений</p>
          ) : (
            <div className="space-y-3">
              {displayInflows.slice(0, 10).map((t: any, idx: number) => {
                const txDate =
                  typeof t.date === "string" ? t.date.split("T")[0] : t.date;
                const cp = counterparties?.find(
                  (c: any) => c.id === t.counterparty_id,
                );
                const amount = parseFloat(t.amount || 0);

                return (
                  <div
                    key={idx}
                    className="flex items-start justify-between p-3 bg-red-50/50 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {txDate.substring(8, 10)}.{txDate.substring(5, 7)} —{" "}
                        {t.description ||
                          t.debit_account_name ||
                          t.debit_account_id ||
                          "Платёж"}
                      </p>
                      {cp?.name && (
                        <p className="text-xs text-gray-500">{cp.name}</p>
                      )}
                      {t.is_tax && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                          Обязательный
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-green-600 whitespace-nowrap">
                      +{amount.toLocaleString("ru-RU")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {forecast.length > 0 &&
        (() => {
          const groupedByDate = new Map<string, any[]>();
          forecast.forEach((f) => {
            if (!groupedByDate.has(f.date)) {
              groupedByDate.set(f.date, []);
            }
            groupedByDate.get(f.date)!.push(f);
          });

          return (
            <div className="p-6 border-t border-gray-100 bg-gray-50/50">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                ПРОГНОЗ ПО ДНЯМ
              </h4>
              <div className="space-y-3">
                {Array.from(groupedByDate.entries())
                  .slice(0, 10)
                  .map(([date, items]: any) => {
                    const dayInflows = items
                      .filter((f: any) => f.type === "income")
                      .reduce((s: number, f: any) => s + f.amount, 0);
                    const dayOutflows = items
                      .filter((f: any) => f.type === "expense")
                      .reduce((s: number, f: any) => s + f.amount, 0);
                    const dayEndBalance = items[items.length - 1].balance_after;
                    const [expandedDay, setExpandedDay] = useState<
                      string | null
                    >(null);
                    const isExpanded = expandedDay === date;

                    return (
                      <div
                        key={date}
                        className="border border-gray-200 rounded-lg bg-white"
                      >
                        <div
                          className="p-3 cursor-pointer hover:bg-gray-50"
                          onClick={() =>
                            setExpandedDay(isExpanded ? null : date)
                          }
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900">
                              {date.substring(8, 10)}.{date.substring(5, 7)}.
                              {date.substring(0, 4)}
                            </span>
                            <span className="text-gray-400 text-xs">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>
                          <div className="space-y-1 text-sm">
                            {dayInflows > 0 && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">
                                  Поступления (
                                  {
                                    items.filter(
                                      (f: any) => f.type === "income",
                                    ).length
                                  }
                                  )
                                </span>
                                <span className="text-green-600 font-medium">
                                  +{dayInflows.toLocaleString("ru-RU")} ₽
                                </span>
                              </div>
                            )}
                            {dayOutflows > 0 && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">
                                  Платежи (
                                  {
                                    items.filter(
                                      (f: any) => f.type === "expense",
                                    ).length
                                  }
                                  )
                                </span>
                                <span className="text-red-600 font-medium">
                                  -{dayOutflows.toLocaleString("ru-RU")} ₽
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between border-t pt-1 mt-1">
                              <span className="text-gray-700 font-medium">
                                Остаток на конец дня
                              </span>
                              <span className="font-bold text-gray-900">
                                {dayEndBalance.toLocaleString("ru-RU")} ₽
                              </span>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-3 border-t border-gray-100 bg-gray-50/50">
                            {items.map((item: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex justify-between text-sm py-1"
                              >
                                <span className="text-gray-600">
                                  {item.description ||
                                    (item.type === "income"
                                      ? "Поступление"
                                      : "Платёж")}
                                  {item.counterparty_name
                                    ? ` — ${item.counterparty_name}`
                                    : ""}
                                </span>
                                <span
                                  className={`font-medium ${item.type === "income" ? "text-green-600" : "text-red-600"}`}
                                >
                                  {item.type === "income" ? "+" : "-"}
                                  {item.amount.toLocaleString("ru-RU")} ₽
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              {forecast.some((f) => f.balance_after < 0) && (
                <div className="mt-3 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
                  ⚠️ Обнаружен кассовый разрыв! Остаток станет отрицательным.
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}

// ============================================
// GET TAX PAYMENTS — автоматические налоговые платежи
// ============================================
function getTaxPayments(
  companies: any[],
  accounts: any[],
  settings: any[],
): any[] {
  const payments: any[] = [];
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const settingsMap: any = {};
  settings.forEach((s) => {
    settingsMap[s.key] = s.value;
  });

  const vatDay = parseInt(settingsMap["vat_payment_day"] || "28");
  const usnDay = parseInt(settingsMap["usn_payment_day"] || "28");
  const insuranceDay = parseInt(settingsMap["insurance_payment_day"] || "15");
  const ndflDay = parseInt(settingsMap["ndfl_payment_day"] || "15");

  for (const company of companies) {
    const hasEmployees =
      company.has_employees === true || company.has_employees === "true";
    const payroll = company.monthly_payroll || 0;

    if (hasEmployees && payroll > 0) {
      const insuranceAmount =
        payroll * parseFloat(settingsMap["insurance_base_rate"] || "0.30");

      for (let i = 0; i < 3; i++) {
        const paymentMonth = currentMonth + i + 1;
        const paymentYear = currentYear + Math.floor((paymentMonth - 1) / 12);
        const actualMonth = ((paymentMonth - 1) % 12) + 1;
        const paymentDate = `${paymentYear}-${String(actualMonth).padStart(2, "0")}-${String(insuranceDay).padStart(2, "0")}`;

        payments.push({
          date: paymentDate,
          company_id: company.id,
          company_name: company.name,
          type: "expense",
          description: "Страховые взносы",
          amount: Math.round(insuranceAmount * 100) / 100,
          counterparty_name: "ИФНС",
          is_tax: true,
          tax_type: "insurance",
          record_type: "plan",
        });
      }
    }

    if (hasEmployees && payroll > 0) {
      const ndflAmount =
        payroll * parseFloat(settingsMap["ndfl_base_rate"] || "0.13");

      for (let i = 0; i < 3; i++) {
        const paymentMonth = currentMonth + i + 1;
        const paymentYear = currentYear + Math.floor((paymentMonth - 1) / 12);
        const actualMonth = ((paymentMonth - 1) % 12) + 1;
        const paymentDate = `${paymentYear}-${String(actualMonth).padStart(2, "0")}-${String(ndflDay).padStart(2, "0")}`;

        payments.push({
          date: paymentDate,
          company_id: company.id,
          company_name: company.name,
          type: "expense",
          description: "НДФЛ",
          amount: Math.round(ndflAmount * 100) / 100,
          counterparty_name: "ИФНС",
          is_tax: true,
          tax_type: "ndfl",
          record_type: "plan",
        });
      }
    }

    if (
      company.tax_system === "USN_6" ||
      company.tax_system === "USN_15" ||
      company.tax_system === "OSNO"
    ) {
      const quarterMonths = [3, 6, 9, 12];

      for (const qMonth of quarterMonths) {
        if (qMonth > currentMonth) {
          const taxDate = `${currentYear}-${String(qMonth).padStart(2, "0")}-${String(usnDay).padStart(2, "0")}`;
          const taxLabel =
            company.tax_system === "OSNO" ? "Налог на прибыль" : "УСН";

          payments.push({
            date: taxDate,
            company_id: company.id,
            company_name: company.name,
            type: "expense",
            description: taxLabel,
            amount: 0,
            counterparty_name: "ИФНС",
            is_tax: true,
            tax_type: company.tax_system === "OSNO" ? "profit" : "usn",
            record_type: "plan",
          });
        }
      }
    }

    if (company.tax_system === "OSNO") {
      const quarterMonths = [3, 6, 9, 12];

      for (const qMonth of quarterMonths) {
        if (qMonth > currentMonth) {
          const vatDate = `${currentYear}-${String(qMonth).padStart(2, "0")}-${String(vatDay).padStart(2, "0")}`;

          payments.push({
            date: vatDate,
            company_id: company.id,
            company_name: company.name,
            type: "expense",
            description: "НДС",
            amount: 0,
            counterparty_name: "ИФНС",
            is_tax: true,
            tax_type: "vat",
            record_type: "plan",
          });
        }
      }
    }
  }

  return payments;
}
