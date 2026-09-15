import { NextRequest, NextResponse } from "next/server";
import { calculator } from "@/lib/engine/calculator";
import { taxEngine } from "@/lib/engine/tax";
import { loadSystemAccounts } from "@/lib/config/accounts";

const GAS_URL =
  process.env.NEXT_PUBLIC_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbzdcT2cZO5ynSBVMWakir1Y5aAaf5MJaqRq1C8zXDrECdaLbtT_yw3idz7FUNjpMShriw/exec";

async function gasGet(
  sheet: string,
): Promise<{ data: any[]; elapsed_ms: number }> {
  const startTime = Date.now();
  const url = `${GAS_URL}?action=getAll&sheet=${sheet}`;
  const response = await fetch(url);
  const data = await response.json();
  const elapsed = Date.now() - startTime;
  return { data: Array.isArray(data) ? data : [], elapsed_ms: elapsed };
}

export async function GET(request: NextRequest) {
  try {
    const results: any[] = [];

    // ============ 1. Замеряем загрузку листов ============
    const sheets = [
      "Companies",
      "Accounts",
      "Transactions",
      "Settings",
      "Budgets",
      "Counterparties",
    ];

    for (const sheet of sheets) {
      const { data, elapsed_ms } = await gasGet(sheet);
      results.push({
        type: "gas_sheet",
        name: sheet,
        rows: data.length,
        time_ms: elapsed_ms,
        status:
          elapsed_ms > 3000 ? "critical" : elapsed_ms > 1500 ? "warning" : "ok",
      });
    }

    // ============ 2. Замеряем загрузку всех листов параллельно ============
    const parallelStart = Date.now();
    const [transactions, accounts, companies, settings] = await Promise.all([
      gasGet("Transactions"),
      gasGet("Accounts"),
      gasGet("Companies"),
      gasGet("Settings"),
    ]);
    const parallelElapsed = Date.now() - parallelStart;

    results.push({
      type: "parallel_load",
      name: "Все листы параллельно",
      time_ms: parallelElapsed,
      status:
        parallelElapsed > 5000
          ? "critical"
          : parallelElapsed > 2500
            ? "warning"
            : "ok",
    });

    // ============ 3. Замеряем расчёт отчётов ============
    const txData = transactions.data;
    const accData = accounts.data;
    const compData = companies.data;

    await taxEngine.loadSettings(settings.data);
    loadSystemAccounts(settings.data);

    // P&L
    const pnlStart = Date.now();
    for (const company of compData) {
      calculator.calculatePnL(
        txData,
        accData,
        company.id,
        "2026-01-01",
        "2026-12-31",
        company,
      );
    }
    const pnlElapsed = Date.now() - pnlStart;
    results.push({
      type: "report",
      name: "ОПиУ (P&L)",
      time_ms: pnlElapsed,
      status: pnlElapsed > 2000 ? "warning" : "ok",
    });

    // Cash Flow
    const cfStart = Date.now();
    for (const company of compData) {
      calculator.calculateCashFlow(
        txData,
        accData,
        company.id,
        "2026-01-01",
        "2026-12-31",
        company,
      );
    }
    const cfElapsed = Date.now() - cfStart;
    results.push({
      type: "report",
      name: "ДДС (Cash Flow)",
      time_ms: cfElapsed,
      status: cfElapsed > 2000 ? "warning" : "ok",
    });

    // Balance
    const balStart = Date.now();
    for (const company of compData) {
      calculator.calculateBalanceSheet(
        txData,
        accData,
        company.id,
        "2026-12-31",
        company,
      );
    }
    const balElapsed = Date.now() - balStart;
    results.push({
      type: "report",
      name: "Баланс",
      time_ms: balElapsed,
      status: balElapsed > 2000 ? "warning" : "ok",
    });

    // ============ Итоги ============
    // Сумма всех индивидуальных замеров (для диагностики)
    const totalTime = results
      .filter((r) => r.type !== "parallel_load")
      .reduce((sum, r) => sum + r.time_ms, 0);

    // Реальное время = время параллельной загрузки (как пользователь ощущает)
    const parallelTime =
      results.find((r) => r.type === "parallel_load")?.time_ms || totalTime;
    const slowest = [...results].sort((a, b) => b.time_ms - a.time_ms)[0];

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      data_source: {
        type: "gas",
        host: GAS_URL,
        expected_latency_ms: 2000,
      },
      results,
      summary: {
        total_time_ms: totalTime,
        parallel_time_ms: parallelTime,
        slowest: slowest,
        recommendations: (() => {
          const nameMap: { [key: string]: string } = {
            Companies: "Компании",
            Accounts: "Счета",
            Transactions: "Операции",
            Settings: "Настройки",
            Budgets: "Бюджеты",
            Counterparties: "Контрагенты",
            "Все листы параллельно": "Все листы (параллельно)",
            "ОПиУ (P&L)": "ОПиУ",
            "ДДС (Cash Flow)": "ДДС",
            Баланс: "Баланс",
          };
          const slowestName = nameMap[slowest.name] || slowest.name;
          return [
            slowest.time_ms > 3000
              ? `${slowestName} — узкое место (${slowest.time_ms}мс). Рассмотрите оптимизацию.`
              : "Все этапы в пределах нормы.",
            "Переход на PostgreSQL ускорит систему в 10-20 раз.",
          ];
        })(),
      },
    });
  } catch (error) {
    console.error("Ошибка performance теста:", error);
    return NextResponse.json({
      error: (error as Error).message,
      stack: (error as Error).stack,
      timestamp: new Date().toISOString(),
      results: [],
      summary: {
        total_time_ms: 0,
        parallel_time_ms: 0,
        slowest: { name: "—", time_ms: 0 },
        recommendations: ["Тест упал. Смотрите error и stack выше."],
      },
      data_source: { type: "gas", host: GAS_URL, expected_latency_ms: 2000 },
    });
  }
}
