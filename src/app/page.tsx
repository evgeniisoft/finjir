"use client";
import { getSystemAccount } from "@/lib/config/accounts";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/utils/dateFormat";
import { getPeriodRange, type PeriodType } from "@/lib/utils/period";

function getDateStr(date: any): string {
  if (!date) return "";
  if (typeof date === "string") return date.split("T")[0];
  if (date instanceof Date) return date.toISOString().split("T")[0];
  return String(date).split("T")[0];
}

export default function Dashboard() {
  const router = useRouter();
  const [companies, setCompanies] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [balanceData, setBalanceData] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [usnLimits, setUsnLimits] = useState<any[]>([]);

  const defaultPeriod = getPeriodRange("month");
  const [period, setPeriod] = useState({
    start: defaultPeriod.start,
    end: defaultPeriod.end,
  });
  const [activePeriod, setActivePeriod] = useState<
    "month" | "quarter" | "year" | "today" | "custom"
  >("month");
  const [periodLabel, setPeriodLabel] = useState(defaultPeriod.label);
  const [expandedPanels, setExpandedPanels] = useState<{
    [key: string]: boolean;
  }>({});

  useEffect(() => {
    loadData({ start: period.start, end: period.end });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async (customPeriod?: { start: string; end: string }) => {
    const currentPeriod = customPeriod || period;
    try {
      setLoading(true);
      const [
        companiesData,
        reportsData,
        balanceResponse,
        transactionsData,
        accountsData,
      ] = await Promise.all([
        api.getAll("Companies"),
        fetch(
          `/api/reports?type=pnl&period_start=${currentPeriod.start}&period_end=${currentPeriod.end}`,
        ).then((r) => r.json()),
        fetch(
          `/api/reports?type=balance&period_start=${currentPeriod.start}&period_end=${currentPeriod.end}`,
        ).then((r) => r.json()),
        api.getAll("Transactions"),
        api.getAll("Accounts"),
      ]);
      setCompanies(companiesData);
      setReports(Array.isArray(reportsData) ? reportsData : []);
      setBalanceData(Array.isArray(balanceResponse) ? balanceResponse : []);
      setTransactions(Array.isArray(transactionsData) ? transactionsData : []);
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
      // Загружаем диагностику
      const diagnosticsRes = await fetch("/api/diagnostics");
      const diagnosticsData = await diagnosticsRes.json();
      setDiagnostics(diagnosticsData);
      // Загружаем лимиты УСН
      const usnLimitsRes = await fetch("/api/reports/usn-limits");
      const usnLimitsData = await usnLimitsRes.json();
      setUsnLimits(Array.isArray(usnLimitsData) ? usnLimitsData : []);
      setError(null);
    } catch (err) {
      setError("Ошибка при загрузке данных");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyPeriod = (type: PeriodType) => {
    const range = getPeriodRange(type);
    setPeriod({ start: range.start, end: range.end });
    setActivePeriod(type);
    setPeriodLabel(range.label);
    loadData({ start: range.start, end: range.end });
  };

  const togglePanel = (panelId: string) => {
    setExpandedPanels((prev) => ({ ...prev, [panelId]: !prev[panelId] }));
  };

  const reportsArray = Array.isArray(reports) ? reports : [];
  const balanceArray = Array.isArray(balanceData) ? balanceData : [];

  const totalRevenue = reportsArray.reduce(
    (s, r) => s + (r.report?.revenue || 0),
    0,
  );
  const totalExpenses = reportsArray.reduce(
    (s, r) =>
      s +
      (r.report?.cost_of_goods_sold || 0) +
      (r.report?.operating_expenses || 0),
    0,
  );
  const totalNetProfit = reportsArray.reduce(
    (s, r) => s + (r.report?.net_profit || 0),
    0,
  );
  const totalCash = balanceArray.reduce(
    (s, r) => s + (r.report?.assets?.cash || 0),
    0,
  );
  const margin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

  // EBITDA = Чистая прибыль + Налог на прибыль + Амортизация
  const totalDepreciation = reportsArray.reduce(
    (s, r) => s + (r.report?.depreciation || 0),
    0,
  );
  const totalIncomeTaxForEBITDA = reportsArray.reduce(
    (s, r) => s + (r.tax?.income_tax_amount || 0),
    0,
  );
  const ebitda = totalNetProfit + totalIncomeTaxForEBITDA + totalDepreciation;

  // Run Rate — скользящее среднее за последние 3 месяца
  const today = new Date();

  // Определяем последние 3 полных месяца
  const last3Months: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    last3Months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  // Выручка за последние 3 месяца
  const last3MonthsRevenue = last3Months.reduce((sum, month) => {
    const monthRevenue = transactions
      .filter(
        (t) => getDateStr(t.date).startsWith(month) && t.type === "income",
      )
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    return sum + monthRevenue;
  }, 0);

  // Среднемесячная выручка (Run Rate)
  const runRate = last3MonthsRevenue / 3;
  const totalTaxData = reportsArray.map((r) => r.tax).filter(Boolean);
  const totalIncomeTax = totalTaxData.reduce(
    (s, t) => s + (t.income_tax_amount || 0),
    0,
  );
  const totalInsurance = totalTaxData.reduce(
    (s, t) => s + (t.insurance_amount || 0),
    0,
  );
  const totalVat = totalTaxData.reduce((s, t) => s + (t.vat_to_pay || 0), 0);
  const effectiveTaxRate =
    totalRevenue > 0 ? (totalIncomeTax / totalRevenue) * 100 : 0;
  const totalNdf = totalTaxData.reduce((s, t) => s + (t.ndfl_amount || 0), 0);

  const quarterlyVat =
    totalVat > 0
      ? [
          { quarter: "1 квартал", date: "2026-04-28", amount: totalVat / 4 },
          { quarter: "2 квартал", date: "2026-07-28", amount: totalVat / 4 },
          { quarter: "3 квартал", date: "2026-10-28", amount: totalVat / 4 },
          { quarter: "4 квартал", date: "2027-01-28", amount: totalVat / 4 },
        ]
      : [];

  const gaps: any[] = [];
  let runningBalance = totalCash;
  const cashGapForecastDays = parseInt(
    process.env.NEXT_PUBLIC_CASH_GAP_DAYS || "30",
  );
  for (let i = 0; i < cashGapForecastDays; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const dayTx = transactions.filter((t) =>
      getDateStr(t.date).startsWith(dateStr),
    );
    const inflow = dayTx
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const outflow = dayTx
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    runningBalance += inflow - outflow;
    if (runningBalance < 0)
      gaps.push({ date: dateStr, deficit: Math.abs(runningBalance) });
  }

  const periodTx = transactions.filter((t) => {
    const d = getDateStr(t.date);
    return d >= period.start && d <= period.end;
  });
  const expenseAccounts = accounts.filter((a) => a.type === "X");
  const expensesByCategory = expenseAccounts
    .map((a) => {
      const amount = periodTx
        .filter((t) => t.debit_account_id === a.id)
        .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
      return { id: a.id, name: a.name, amount };
    })
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const sumExpensesByCategory = expensesByCategory.reduce(
    (s, e) => s + e.amount,
    0,
  );

  const arAccount = getSystemAccount("ar");
  const apAccount = getSystemAccount("ap");
  const unclassifiedAccount = getSystemAccount("unclassified");

  const totalAR = transactions
    .filter((t) => t.debit_account_id === arAccount)
    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const totalAP = transactions
    .filter((t) => t.credit_account_id === apAccount)
    .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const arAlertThreshold = parseFloat(
    process.env.NEXT_PUBLIC_AR_ALERT_THRESHOLD || "1000000",
  );
  const apAlertThreshold = parseFloat(
    process.env.NEXT_PUBLIC_AP_ALERT_THRESHOLD || "1000000",
  );
  const unclassifiedTx = transactions.filter(
    (t) =>
      t.debit_account_id === unclassifiedAccount ||
      t.credit_account_id === unclassifiedAccount,
  );
  const unclassifiedAmount = unclassifiedTx.reduce(
    (s, t) => s + parseFloat(t.amount || 0),
    0,
  );

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-500 mt-4">Загрузка данных...</p>
      </div>
    );
  }

  const Widget = ({
    id,
    label,
    value,
    suffix = "₽",
    color = "text-gray-900",
    children,
  }: any) => (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm cursor-pointer"
      onClick={() => togglePanel(id)}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{label}</p>
        <span className="text-gray-400 text-xs">
          {expandedPanels[id] ? "▲" : "▼"}
        </span>
      </div>
      <p className={`text-xl font-bold mt-1 ${color}`}>
        {typeof value === "number" ? value.toLocaleString("ru-RU") : value}{" "}
        {suffix}
      </p>
      {expandedPanels[id] && (
        <div className="mt-3 pt-3 border-t border-gray-100">{children}</div>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Дашборд</h2>
          <p className="text-gray-500 mt-1">
            Финансовое состяние бизнеса • {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => applyPeriod("today")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activePeriod === "today" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Сегодня
          </button>
          <button
            onClick={() => applyPeriod("month")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activePeriod === "month" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Месяц
          </button>
          <button
            onClick={() => applyPeriod("quarter")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activePeriod === "quarter" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Квартал
          </button>
          <button
            onClick={() => applyPeriod("year")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activePeriod === "year" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Год
          </button>
          <input
            type="date"
            value={period.start}
            onChange={(e) => {
              setPeriod({ ...period, start: e.target.value });
              setActivePeriod("custom");
              setPeriodLabel(`Произвольный: ${e.target.value} — ${period.end}`);
            }}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
          />
          <span className="text-gray-400 text-xs">—</span>
          <input
            type="date"
            value={period.end}
            onChange={(e) => {
              setPeriod({ ...period, end: e.target.value });
              setActivePeriod("custom");
              setPeriodLabel(
                `Произвольный: ${period.start} — ${e.target.value}`,
              );
            }}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
          />
          <button
            onClick={() => {
              setLoading(true);
              setTimeout(() => loadData(), 100);
            }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
          >
            OK
          </button>
        </div>
      </div>

      {/* Ряд 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Widget id="cash" label="Деньги на счетах" value={totalCash}>
          {companies.map((company: any) => {
            const companyAccounts = accounts.filter(
              (a) => a.is_cash_flow === "true" || a.is_cash_flow === true,
            );
            const accWithBalance = companyAccounts
              .map((acc) => {
                const accTx = transactions.filter((t) => {
                  const d = getDateStr(t.date);
                  return (
                    t.company_id === company.id &&
                    (t.debit_account_id === acc.id ||
                      t.credit_account_id === acc.id) &&
                    d <= period.end
                  ); // Только до конца выбранного периода
                });
                const balance = accTx.reduce((s, t) => {
                  if (t.debit_account_id === acc.id)
                    return s + parseFloat(t.amount || 0);
                  if (t.credit_account_id === acc.id)
                    return s - parseFloat(t.amount || 0);
                  return s;
                }, 0);
                return { account: acc, balance };
              })
              .filter((item) => item.balance !== 0);
            if (accWithBalance.length === 0) return null;
            return (
              <div key={company.id} className="mb-2">
                <p className="text-xs font-medium text-gray-900">
                  {company.name}
                </p>
                {accWithBalance.map((item) => (
                  <div
                    key={item.account.id}
                    className="flex justify-between text-sm ml-3 py-1"
                  >
                    <span className="text-gray-600">{item.account.name}</span>
                    <span
                      className={
                        item.balance >= 0
                          ? "font-medium"
                          : "font-medium text-red-600"
                      }
                    >
                      {item.balance.toLocaleString("ru-RU")} ₽
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </Widget>

        <Widget id="revenue" label="Выручка" value={totalRevenue}>
          {reportsArray.map((r) => (
            <div
              key={r.company.id}
              className="flex justify-between text-sm py-1"
            >
              <span className="text-gray-600">{r.company.name}</span>
              <span className="font-medium">
                {(r.report?.revenue || 0).toLocaleString("ru-RU")} ₽
              </span>
            </div>
          ))}
        </Widget>

        <Widget id="expenses" label="Расходы" value={totalExpenses}>
          {reportsArray.map((r) => (
            <div key={r.company.id} className="mb-2">
              <p className="text-xs font-medium text-gray-900">
                {r.company.name}
              </p>
              <div className="flex justify-between text-sm ml-3 py-1">
                <span className="text-gray-600">Расходы</span>
                <span className="font-medium">
                  {(r.report?.operating_expenses || 0).toLocaleString("ru-RU")}{" "}
                  ₽
                </span>
              </div>
            </div>
          ))}
        </Widget>

        <Widget
          id="profit"
          label="Прибыль"
          value={Math.round(totalNetProfit)}
          color={totalNetProfit >= 0 ? "text-green-600" : "text-red-600"}
        >
          {reportsArray.map((r) => (
            <div
              key={r.company.id}
              className="flex justify-between text-sm py-1"
            >
              <span className="text-gray-600">{r.company.name}</span>
              <span
                className={
                  r.report?.net_profit >= 0
                    ? "font-medium text-green-600"
                    : "font-medium text-red-600"
                }
              >
                {(r.report?.net_profit || 0).toLocaleString("ru-RU")} ₽
              </span>
            </div>
          ))}
        </Widget>
      </div>

      {/* Ряд 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Widget
          id="margin"
          label="Рентабельность"
          value={margin.toFixed(1)}
          suffix="%"
        >
          {reportsArray.map((r) => {
            const rev = r.report?.revenue || 0;
            const profit = r.report?.net_profit || 0;
            const m = rev > 0 ? (profit / rev) * 100 : 0;
            return (
              <div
                key={r.company.id}
                className="flex justify-between text-sm py-1"
              >
                <span className="text-gray-600">{r.company.name}</span>
                <span className="font-medium">{m.toFixed(1)}%</span>
              </div>
            );
          })}
        </Widget>

        <Widget id="ebitda" label="EBITDA" value={Math.round(ebitda)}>
          {reportsArray.map((r) => {
            const companyEBITDA =
              (r.report?.net_profit || 0) +
              (r.tax?.income_tax_amount || 0) +
              (r.report?.depreciation || 0);
            return (
              <div
                key={r.company.id}
                className="flex justify-between text-sm py-1"
              >
                <span className="text-gray-600">{r.company.name}</span>
                <span className="font-medium">
                  {Math.round(companyEBITDA).toLocaleString("ru-RU")} ₽
                </span>
              </div>
            );
          })}
        </Widget>

        <Widget
          id="runrate"
          label="Run Rate"
          value={Math.round(runRate)}
          suffix="₽/мес"
        >
          <div className="mb-2 text-xs text-gray-500">
            Скользящее среднее за 3 месяца:{" "}
            {last3Months
              .map((m) => {
                const [y, mo] = m.split("-");
                const monthNames = [
                  "янв",
                  "фев",
                  "мар",
                  "апр",
                  "май",
                  "июн",
                  "июл",
                  "авг",
                  "сен",
                  "окт",
                  "ноя",
                  "дек",
                ];
                return `${monthNames[parseInt(mo) - 1]} ${y}`;
              })
              .join(", ")}
          </div>
          {reportsArray.map((r) => {
            // Для каждой компании считаем среднюю выручку за 3 месяца
            const companyRevenue3Months = last3Months.reduce((sum, month) => {
              const monthRevenue = transactions
                .filter(
                  (t) =>
                    t.company_id === r.company.id &&
                    getDateStr(t.date).startsWith(month) &&
                    t.type === "income",
                )
                .reduce((s, t) => s + parseFloat(t.amount || 0), 0);
              return sum + monthRevenue;
            }, 0);

            const companyRunRate = companyRevenue3Months / 3;

            return (
              <div
                key={r.company.id}
                className="flex justify-between text-sm py-1"
              >
                <span className="text-gray-600">{r.company.name}</span>
                <span className="font-medium">
                  {Math.round(companyRunRate).toLocaleString("ru-RU")} ₽/мес
                </span>
              </div>
            );
          })}
        </Widget>

        <Widget
          id="taxes"
          label="Налоги"
          value={totalIncomeTax}
          suffix="₽ (5.2%)"
        >
          {totalTaxData.map((tax: any) => (
            <div key={tax.company_id} className="mb-2">
              <p className="text-xs font-medium text-gray-900">
                {tax.company_name}
              </p>
              <div className="flex justify-between text-sm ml-3 py-1">
                <span className="text-gray-600">Налог</span>
                <span className="font-medium">
                  {Number(tax.income_tax_amount || 0).toLocaleString("ru-RU")} ₽
                </span>
              </div>
              <div className="flex justify-between text-sm ml-3 py-1">
                <span className="text-gray-600">Взносы</span>
                <span className="font-medium">
                  {Number(tax.insurance_amount || 0).toLocaleString("ru-RU")} ₽
                </span>
              </div>
              <div className="flex justify-between text-sm ml-3 py-1">
                <span className="text-gray-600">НДФЛ</span>
                <span className="font-medium">
                  {tax.ndfl_amount?.toLocaleString("ru-RU") || 0} ₽
                </span>
              </div>
            </div>
          ))}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex justify-between text-sm py-1">
              <span className="font-medium">Налоги</span>
              <span className="font-bold">
                {totalIncomeTax.toLocaleString("ru-RU")} ₽
              </span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="font-medium">Взносы</span>
              <span className="font-bold">
                {totalInsurance.toLocaleString("ru-RU")} ₽
              </span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="font-medium">НДФЛ</span>
              <span className="font-bold">
                {totalNdf.toLocaleString("ru-RU")} ₽
              </span>
            </div>
            <div className="flex justify-between text-sm py-1 border-t mt-1">
              <span className="font-semibold">Итого</span>
              <span className="font-bold">
                {(totalIncomeTax + totalInsurance + totalNdf).toLocaleString(
                  "ru-RU",
                )}{" "}
                ₽
              </span>
            </div>
          </div>
        </Widget>
        {/* Лимиты УСН — единый виджет */}
        {usnLimits.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-4">
            <div
              className="cursor-pointer"
              onClick={() => togglePanel("usn_limits")}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Лимиты УСН</p>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {usnLimits.length}{" "}
                    {usnLimits.length === 1
                      ? "компания"
                      : usnLimits.length < 5
                        ? "компании"
                        : "компаний"}{" "}
                    на УСН
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const worst = usnLimits.reduce(
                      (max: any, l: any) =>
                        (l.limits?.exempt?.used_percent || 0) >
                        (max?.limits?.exempt?.used_percent || 0)
                          ? l
                          : max,
                      usnLimits[0],
                    );
                    const worstPercent =
                      worst?.limits?.exempt?.used_percent || 0;
                    const isWarning = worstPercent > 80;
                    const isCritical = worstPercent > 95;

                    return (
                      <span
                        className={`text-sm font-medium ${
                          isCritical
                            ? "text-red-600"
                            : isWarning
                              ? "text-yellow-600"
                              : "text-green-600"
                        }`}
                      >
                        {isCritical
                          ? "Критично"
                          : isWarning
                            ? "Внимание"
                            : "ОК"}
                      </span>
                    );
                  })()}
                  <span className="text-gray-400 text-xs">
                    {expandedPanels["usn_limits"] ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {/* Сводный прогресс-бар */}
              <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                {(() => {
                  const worst = usnLimits.reduce(
                    (max: any, l: any) =>
                      (l.limits?.exempt?.used_percent || 0) >
                      (max?.limits?.exempt?.used_percent || 0)
                        ? l
                        : max,
                    usnLimits[0],
                  );
                  const worstPercent = Math.min(
                    worst?.limits?.exempt?.used_percent || 0,
                    100,
                  );
                  const color =
                    worstPercent > 80
                      ? "bg-red-500"
                      : worstPercent > 60
                        ? "bg-yellow-500"
                        : "bg-green-500";
                  return (
                    <div
                      className={`h-full ${color} rounded-full`}
                      style={{ width: `${worstPercent}%` }}
                    />
                  );
                })()}
              </div>
            </div>

            {/* Развёрнутая часть */}
            {expandedPanels["usn_limits"] && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                {usnLimits.map((limit: any) => {
                  const exemptPercent = limit.limits?.exempt?.used_percent || 0;
                  const exemptThreshold =
                    limit.limits?.exempt?.threshold || 20000000;
                  const remaining = Math.max(
                    0,
                    exemptThreshold - (limit.current_revenue || 0),
                  );
                  const status = !limit.vat_required
                    ? "Без НДС"
                    : !limit.usn_allowed
                      ? "Переход на ОСНО"
                      : `НДС ${(limit.vat_rate * 100).toFixed(0)}%`;

                  const statusColor = !limit.vat_required
                    ? "text-green-600"
                    : !limit.usn_allowed
                      ? "text-red-600"
                      : "text-yellow-600";

                  return (
                    <div
                      key={limit.company_id}
                      className="border border-gray-100 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {limit.company_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {limit.tax_system === "USN_6"
                              ? "УСН 6%"
                              : "УСН 15%"}
                          </p>
                        </div>
                        <span className={`text-sm font-medium ${statusColor}`}>
                          {status}
                        </span>
                      </div>

                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-500">
                            Выручка:{" "}
                            {limit.current_revenue?.toLocaleString("ru-RU")} ₽
                          </span>
                          <span className="text-gray-500">
                            Порог: {exemptThreshold.toLocaleString("ru-RU")} ₽
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              exemptPercent > 80
                                ? "bg-red-500"
                                : exemptPercent > 60
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                            }`}
                            style={{
                              width: `${Math.min(exemptPercent, 100)}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-gray-400">
                            Использовано: {exemptPercent.toFixed(1)}%
                          </span>
                          <span className="text-gray-400">
                            Осталось: {remaining.toLocaleString("ru-RU")} ₽
                          </span>
                        </div>
                        {limit.monthly_run_rate > 0 && (
                          <div className="flex justify-between text-xs mt-1">
                            <span className="text-gray-400">
                              Run Rate:{" "}
                              {limit.monthly_run_rate?.toLocaleString("ru-RU")}{" "}
                              ₽/мес
                            </span>
                            {limit.projected_exceed_date && (
                              <span className="text-yellow-600 font-medium">
                                Превышение: ~{limit.projected_exceed_date}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {!limit.usn_allowed && (
                        <div className="mt-2 p-2 bg-red-50 rounded">
                          <p className="text-xs text-red-700">
                            Требуется переход на ОСНО с{" "}
                            {limit.transition_quarter}
                          </p>
                        </div>
                      )}

                      {limit.usn_allowed && limit.vat_required && (
                        <div className="mt-2 p-2 bg-yellow-50 rounded">
                          <p className="text-xs text-yellow-700">
                            НДС {(limit.vat_rate * 100).toFixed(0)}% с текущего
                            квартала
                          </p>
                        </div>
                      )}

                      {exemptPercent > 80 && limit.usn_allowed && (
                        <div className="mt-2 p-2 bg-yellow-50 rounded">
                          <p className="text-xs text-yellow-700">
                            ⚠️ Приближаетесь к порогу НДС. Подготовьтесь к
                            изменениям.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="text-right">
                  <button
                    onClick={() => {
                      window.location.href =
                        "/diagnostics?category=risks&section=usn_limits";
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Подробнее в диагностике →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* НДС */}
      {totalVat > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Widget id="vat" label="НДС к уплате" value={totalVat}>
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-600">Исходящий</span>
              <span className="font-medium">
                +
                {totalTaxData
                  .reduce((s, t) => s + (t.outgoing_vat || 0), 0)
                  .toLocaleString("ru-RU")}{" "}
                ₽
              </span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-600">Входящий</span>
              <span className="font-medium">
                -
                {totalTaxData
                  .reduce((s, t) => s + (t.incoming_vat || 0), 0)
                  .toLocaleString("ru-RU")}{" "}
                ₽
              </span>
            </div>
            <div className="mt-3">
              <p className="text-xs font-medium mb-2">Сроки уплаты:</p>
              {quarterlyVat.map((q) => (
                <div
                  key={q.quarter}
                  className="flex justify-between text-sm py-1"
                >
                  <span className="text-gray-600">
                    {q.quarter} ({q.date})
                  </span>
                  <span className="font-medium">
                    {Number(q.amount || 0).toLocaleString("ru-RU")} ₽
                  </span>
                </div>
              ))}
            </div>
          </Widget>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2">
              Кассовые разрывы (30 дней)
            </h3>
            {gaps.length === 0 ? (
              <p className="text-green-600">Нет разрывов</p>
            ) : (
              gaps.slice(0, 5).map((gap, idx) => (
                <div
                  key={idx}
                  className="flex justify-between text-sm text-red-600 py-1"
                >
                  <span>{formatDay(gap.date)}</span>
                  <span>
                    -{Number(gap.deficit || 0).toLocaleString("ru-RU")} ₽
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Алерты */}
      {(unclassifiedTx.length > 0 || totalAR > 0 || totalAP > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
          <h3 className="font-semibold text-yellow-700 mb-2">
            Требуют внимания
          </h3>
          {unclassifiedTx.length > 0 && (
            <p className="text-sm text-yellow-600">
              {unclassifiedTx.length} операций без категории (
              {unclassifiedAmount.toLocaleString("ru-RU")} ₽)
            </p>
          )}
          {totalAR > 0 && (
            <p className="text-sm text-yellow-600">
              Дебиторская задолженность: {totalAR.toLocaleString("ru-RU")} ₽
            </p>
          )}
          {totalAP > 0 && (
            <p className="text-sm text-yellow-600">
              Кредиторская задолженность: {totalAP.toLocaleString("ru-RU")} ₽
            </p>
          )}
        </div>
      )}
      {/* Диагностика */}
      {diagnostics && diagnostics.critical > 0 && (
        <div
          className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 cursor-pointer"
          onClick={() => (window.location.href = "/diagnostics")}
        >
          <h3 className="font-semibold text-red-700 mb-2">
            {diagnostics.critical} критичных проблем
          </h3>
          {diagnostics.checks
            .filter((c: any) => c.severity === "critical")
            .slice(0, 3)
            .map((c: any) => (
              <p key={c.id} className="text-sm text-red-600">
                {c.message}
              </p>
            ))}
          <p className="text-xs text-red-400 mt-2">
            Нажмите для полной диагностики →
          </p>
        </div>
      )}

      {/* Структура расходов + Компании */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            Структура расходов ({sumExpensesByCategory.toLocaleString("ru-RU")}{" "}
            ₽)
          </h3>
          <div className="space-y-3">
            {expensesByCategory.map((exp) => {
              const pct =
                sumExpensesByCategory > 0
                  ? (exp.amount / sumExpensesByCategory) * 100
                  : 0;
              return (
                <div key={exp.id}>
                  <div
                    className="flex justify-between text-sm mb-1 cursor-pointer"
                    onClick={() => togglePanel(`expense_${exp.id}`)}
                  >
                    <span className="text-gray-600">{exp.name}</span>
                    <span className="font-medium">
                      {exp.amount.toLocaleString("ru-RU")} ₽ ({Math.round(pct)}
                      %)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {expandedPanels[`expense_${exp.id}`] && (
                    <div className="mt-2 ml-4 space-y-1">
                      {periodTx
                        .filter((t) => t.debit_account_id === exp.id)
                        .slice(0, 10)
                        .map((t) => (
                          <div
                            key={t.id}
                            className="flex justify-between text-xs text-gray-500"
                          >
                            <span>
                              {getDateStr(t.date)} — {t.description}
                            </span>
                            <span>
                              {parseFloat(t.amount || 0).toLocaleString(
                                "ru-RU",
                              )}{" "}
                              ₽
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            Компании холдинга
          </h3>
          <div className="space-y-3">
            {reportsArray.map((report) => {
              const balance = balanceArray.find(
                (b) => b.company?.id === report.company?.id,
              );
              const rev = report.report?.revenue || 0;
              const profit = report.report?.net_profit || 0;
              const m = rev > 0 ? (profit / rev) * 100 : 0;
              return (
                <div
                  key={report.company.id}
                  className="border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                >
                  <p className="font-medium text-gray-900 text-sm">
                    {report.company.name}
                  </p>
                  <div className="flex justify-between text-sm mt-1">
                    <span>Выручка: {rev.toLocaleString("ru-RU")} ₽</span>
                    <span>
                      Прибыль:{" "}
                      <span
                        className={
                          profit >= 0 ? "text-green-600" : "text-red-600"
                        }
                      >
                        {profit.toLocaleString("ru-RU")} ₽
                      </span>
                    </span>
                  </div>
                  <div className="text-sm mt-1 text-gray-500">
                    Рентабельность: {m.toFixed(1)}% • Деньги:{" "}
                    {(balance?.report?.assets?.cash || 0).toLocaleString(
                      "ru-RU",
                    )}{" "}
                    ₽
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-6">
          <p className="text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
