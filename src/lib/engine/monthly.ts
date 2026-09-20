import { Transaction, Account, Company } from "./types";
import { taxEngine } from "./tax";

export type PeriodType = "monthly" | "weekly" | "daily" | "quarterly";

export interface PeriodReport {
  period: string;
  revenue: number;
  expenses: number;
  profit: number;
  cash_in: number;
  cash_out: number;
  tax_outflow: number;
  net_cash_flow: number;
  starting_balance: number;
  ending_balance: number;
  details: {
    [accountId: string]: number;
  };
}

export class MonthlyEngine {
  getPeriodBreakdown(
    transactions: Transaction[],
    accounts: Account[],
    companyId: string,
    periodStart: string,
    periodEnd: string,
    periodType: PeriodType = "monthly",
    company?: Company,
    reportType: "pnl" | "cashflow" | "balance" = "pnl",
  ): PeriodReport[] {
    const filtered = transactions.filter(
      (t) =>
        t.company_id === companyId &&
        t.date >= periodStart &&
        t.date <= periodEnd,
    );
    // Годовой taxCalc (для месячных периодов — единый расчёт)
    let annualTaxCalc: any = null;
    let annualTaxCalcYear: string = "";
    if (company) {
      annualTaxCalcYear = periodStart.substring(0, 4);
      const yearStart = `${annualTaxCalcYear}-01-01`;
      const yearEnd = `${annualTaxCalcYear}-12-31`;
      annualTaxCalc = taxEngine.calculateTax(
        company,
        transactions,
        accounts,
        yearStart,
        yearEnd,
      );
    }
    // Группируем по периодам
    const periodsMap = new Map<string, Transaction[]>();

    for (const t of filtered) {
      const periodKey = this.getPeriodKey(t.date, periodType);
      if (!periodsMap.has(periodKey)) {
        periodsMap.set(periodKey, []);
      }
      periodsMap.get(periodKey)!.push(t);
    }

    // Создаём ВСЕ периоды в диапазоне, даже если операций в периоде нет
    const allPeriodsSet = new Set<string>(periodsMap.keys());
    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);

    if (periodType === "monthly") {
      const current = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        1,
      );
      while (current <= endDate) {
        const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
        allPeriodsSet.add(key);
        current.setMonth(current.getMonth() + 1);
      }
    } else if (periodType === "quarterly") {
      const current = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        1,
      );
      while (current <= endDate) {
        const q = Math.ceil((current.getMonth() + 1) / 3);
        const key = `${current.getFullYear()}-Q${q}`;
        allPeriodsSet.add(key);
        current.setMonth(current.getMonth() + 3);
      }
    } else if (periodType === "daily") {
      const current = new Date(startDate);
      while (current <= endDate) {
        allPeriodsSet.add(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
    } else if (periodType === "weekly") {
      const current = new Date(startDate);
      while (current <= endDate) {
        const year = current.getFullYear();
        const week = this.getWeekNumber(current);
        allPeriodsSet.add(`${year}-W${String(week).padStart(2, "0")}`);
        current.setDate(current.getDate() + 7);
      }
    }

    const sortedPeriods = Array.from(allPeriodsSet).sort();

    // Начальный остаток — операции до periodStart
    const beforePeriod = transactions.filter((t) => {
      const txDate =
        typeof t.date === "string"
          ? t.date.split("T")[0]
          : String(t.date || "").split("T")[0];
      return t.company_id === companyId && txDate < periodStart;
    });

    let runningBalance = 0;
    for (const t of beforePeriod) {
      const debitAcc = accounts.find((a) => a.id === t.debit_account_id);
      const creditAcc = accounts.find((a) => a.id === t.credit_account_id);
      if (!debitAcc || !creditAcc) continue;
      const debitIsCash = Boolean(debitAcc.is_cash_flow);
      const creditIsCash = Boolean(creditAcc.is_cash_flow);
      if (debitIsCash) runningBalance += t.amount_rub;
      if (creditIsCash) runningBalance -= t.amount_rub;
    }

    // Для cashflow — вычитаем налоги за все месяцы до ПЕРВОГО периода отчёта
    if (reportType === "cashflow" && company && sortedPeriods.length > 0) {
      const firstPeriod = sortedPeriods[0];
      const firstPeriodStart = this.getPeriodStartDate(firstPeriod, periodType);
      const firstPeriodMonth = firstPeriodStart.substring(0, 7);

      const monthsBeforeReport: string[] = [];
      for (const t of transactions) {
        if (t.company_id !== companyId) continue;
        const txDate =
          typeof t.date === "string"
            ? t.date.split("T")[0]
            : String(t.date || "").split("T")[0];
        const monthKey = txDate.substring(0, 7);
        if (
          monthKey < firstPeriodMonth &&
          !monthsBeforeReport.includes(monthKey)
        ) {
          // Проверяем, есть ли в этом месяце РЕАЛЬНАЯ выручка (счета типа 'I')
          const hasRevenue = transactions.some((tr) => {
            if (tr.company_id !== companyId) return false;
            const trDate =
              typeof tr.date === "string"
                ? tr.date.split("T")[0]
                : String(tr.date || "").split("T")[0];
            if (!trDate.startsWith(monthKey)) return false;
            const creditAcc = accounts.find(
              (a) => a.id === tr.credit_account_id,
            );
            return creditAcc?.type === "I";
          });

          if (hasRevenue) {
            monthsBeforeReport.push(monthKey);
          }
        }
      }

      for (const monthKey of monthsBeforeReport) {
        const monthStart = `${monthKey}-01`;
        const [y, m] = monthKey.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        const monthEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

        const taxCalcBefore = taxEngine.calculateTax(
          company,
          transactions,
          accounts,
          monthStart,
          monthEnd,
        );

        const monthNum = m;
        const isQuarterEndBefore =
          monthNum === 3 || monthNum === 6 || monthNum === 9 || monthNum === 12;
        const isIndividualBefore =
          Boolean(company?.is_individual) ||
          String(company?.is_individual).toLowerCase() === "true";

        const vatPayment = isQuarterEndBefore ? taxCalcBefore.vat_to_pay : 0;
        const incomeTaxPayment = isQuarterEndBefore
          ? taxCalcBefore.income_tax_amount
          : 0;
        const insurancePayment = taxCalcBefore.insurance_amount || 0;
        const ndflPayment = taxCalcBefore.ndfl_amount || 0;
        const ipFixedPayment = isIndividualBefore
          ? taxCalcBefore.ip_fixed_amount || 0
          : 0;

        runningBalance -=
          insurancePayment +
          ndflPayment +
          vatPayment +
          incomeTaxPayment +
          ipFixedPayment;
      }
    }

    // Для balance: считаем начальные остатки по каждому счёту
    let balanceDetails: { [accountId: string]: number } = {};
    if (reportType === "balance") {
      balanceDetails = this.calculateBalanceDetails(beforePeriod, accounts);
    }

    const reports: PeriodReport[] = [];

    for (const period of sortedPeriods) {
      const periodTransactions = periodsMap.get(period) || [];

      // Определяем начало и конец периода
      const periodStartDate = this.getPeriodStartDate(period, periodType);
      const periodEndDate = this.getPeriodEndDate(period, periodType);

      let revenue = 0;
      let expenses = 0;
      let cashIn = 0;
      let cashOut = 0;
      const details: { [accountId: string]: number } = {};

      // Расчёт налогов для этого периода
      let taxCalc: any = null;
      if (company) {
        if (
          periodType === "monthly" &&
          annualTaxCalc &&
          periodStart.startsWith(annualTaxCalcYear)
        ) {
          // Пересчитываем налоги от фактической зарплаты месяца
          taxCalc = taxEngine.calculateTax(
            company,
            transactions,
            accounts,
            periodStartDate,
            periodEndDate,
          );
        } else {
          taxCalc = taxEngine.calculateTax(
            company,
            transactions,
            accounts,
            periodStartDate,
            periodEndDate,
          );
        }
      }

      // Есть ли операции в периоде
      const hasPeriodActivity = periodTransactions.length > 0;

      // ============ БАЛАНС ============
      if (reportType === "balance") {
        // Копируем начальные остатки
        for (const [accId, amount] of Object.entries(balanceDetails)) {
          details[accId] = amount;
        }

        // Применяем операции периода
        for (const t of periodTransactions) {
          const debitAccount = accounts.find(
            (a) => a.id === t.debit_account_id,
          );
          const creditAccount = accounts.find(
            (a) => a.id === t.credit_account_id,
          );

          if (!debitAccount || !creditAccount) continue;

          const debitIsCash = Boolean(debitAccount.is_cash_flow);
          const creditIsCash = Boolean(creditAccount.is_cash_flow);

          // Денежные счета
          if (debitIsCash) {
            details[debitAccount.id] =
              (details[debitAccount.id] || 0) + t.amount_rub;
          }
          if (creditIsCash) {
            details[creditAccount.id] =
              (details[creditAccount.id] || 0) - t.amount_rub;
          }

          // Не денежные счета
          if (!debitIsCash && debitAccount.type === "A") {
            details[debitAccount.id] =
              (details[debitAccount.id] || 0) + t.amount_rub;
          }
          if (!creditIsCash && creditAccount.type === "A") {
            details[creditAccount.id] =
              (details[creditAccount.id] || 0) - t.amount_rub;
          }

          if (!creditIsCash && creditAccount.type === "L") {
            details[creditAccount.id] =
              (details[creditAccount.id] || 0) + t.amount_rub;
          }
          if (!debitIsCash && debitAccount.type === "L") {
            details[debitAccount.id] =
              (details[debitAccount.id] || 0) - t.amount_rub;
          }

          if (!creditIsCash && creditAccount.type === "E") {
            details[creditAccount.id] =
              (details[creditAccount.id] || 0) + t.amount_rub;
          }
          if (!debitIsCash && debitAccount.type === "E") {
            details[debitAccount.id] =
              (details[debitAccount.id] || 0) - t.amount_rub;
          }
        }

        // Обновляем balanceDetails для следующего периода
        balanceDetails = { ...details };

        const totalAssets = this.calculateTotalAssets(details, accounts);
        let totalLiabilities = this.calculateTotalLiabilities(
          details,
          accounts,
        );

        // Задолженность по налогам — накопительно с начала года
        if (company) {
          const yearStart = `${new Date(periodEndDate).getFullYear()}-01-01`;

          const cumulativeTaxCalc = taxEngine.calculateTax(
            company,
            transactions,
            accounts,
            yearStart,
            periodEndDate,
          );

          const isIndividual =
            Boolean(company?.is_individual) ||
            String(company?.is_individual).toLowerCase() === "true";

          const ipFixed = isIndividual
            ? cumulativeTaxCalc.ip_fixed_amount || 0
            : 0;

          const taxLiability =
            cumulativeTaxCalc.income_tax_amount +
            cumulativeTaxCalc.insurance_amount +
            cumulativeTaxCalc.ndfl_amount +
            cumulativeTaxCalc.vat_to_pay +
            ipFixed;

          totalLiabilities += taxLiability;
          details["acc-tax-liability"] = taxLiability;
        }

        const totalEquity = totalAssets - totalLiabilities;

        reports.push({
          period,
          revenue: 0,
          expenses: 0,
          profit: totalAssets - totalLiabilities,
          cash_in: 0,
          cash_out: 0,
          tax_outflow: 0,
          net_cash_flow: 0,
          starting_balance: 0,
          ending_balance: totalAssets,
          details,
        });
        continue;
      }

      // ============ P&L И CASH FLOW ============
      for (const t of periodTransactions) {
        const debitAccount = accounts.find((a) => a.id === t.debit_account_id);
        const creditAccount = accounts.find(
          (a) => a.id === t.credit_account_id,
        );

        if (!debitAccount || !creditAccount) continue;
        const debitIsCash = Boolean(debitAccount.is_cash_flow);
        const creditIsCash = Boolean(creditAccount.is_cash_flow);

        // Выручка
        if (
          creditAccount.type === "I" &&
          creditAccount.activity_type === "operating" &&
          !creditAccount.id.startsWith("acc-in-invest-") &&
          creditAccount.id !== "acc-in-loan"
        ) {
          let revenueAmount = t.amount_rub;
          // Для ОСНО выделяем НДС
          const vatIncluded =
            String(company?.vat_included).toLowerCase() === "true";
          const vatRate = parseFloat(String(company?.vat_rate || "0"));
          if (vatIncluded && vatRate > 0) {
            revenueAmount = revenueAmount / (1 + vatRate);
          }
          revenue += revenueAmount;
          details[creditAccount.id] =
            (details[creditAccount.id] || 0) + revenueAmount;
        }

        // Расходы — только для P&L
        if (
          reportType === "pnl" &&
          debitAccount.type === "X" &&
          debitAccount.activity_type === "operating" &&
          !debitAccount.id.startsWith("acc-tax-") &&
          !debitAccount.id.startsWith("acc-depreciation-") &&
          debitAccount.id !== "acc-out-capex" &&
          !debitAccount.id.startsWith("acc-out-loan-") &&
          debitAccount.id !== "acc-out-dividends"
        ) {
          let expenseAmount = t.amount_rub;
          const vatIncluded =
            String(company?.vat_included).toLowerCase() === "true";
          const vatRate = parseFloat(String(company?.vat_rate || "0"));
          if (vatIncluded && vatRate > 0) {
            expenseAmount = expenseAmount / (1 + vatRate);
          }
          expenses += expenseAmount;
          details[debitAccount.id] =
            (details[debitAccount.id] || 0) + expenseAmount;
        }

        // ДДС: Поступления
        if (debitIsCash && !creditIsCash) {
          cashIn += t.amount_rub;
          details[`in_${debitAccount.id}`] =
            (details[`in_${debitAccount.id}`] || 0) + t.amount_rub;
        }

        // ДДС: Выбытия — для cashflow НДС НЕ вычитается (кассовый метод)
        if (creditIsCash && !debitIsCash) {
          const cashOutflowAmount = t.amount_rub;
          cashOut += cashOutflowAmount;

          if (
            reportType === "cashflow" &&
            debitAccount.type === "X" &&
            debitAccount.activity_type === "operating"
          ) {
            details[debitAccount.id] =
              (details[debitAccount.id] || 0) + cashOutflowAmount;
          }
        }
      }

      // P&L: revenue/expenses уже посчитаны из операций месяца (не перезаписываем)

      // Флаги для налогов
      const hasEmployees =
        Boolean(company?.has_employees) || (company?.monthly_payroll || 0) > 0;

      // Определяем месяц для periodType
      let monthNum = 0;
      if (periodType === "monthly" || periodType === "daily") {
        // "2026-09" → 9, "2026-09-15" → 9
        monthNum = parseInt(period.substring(5, 7));
      } else if (periodType === "quarterly") {
        // "2026-Q1" → 3 (конец 1 квартала), "2026-Q2" → 6
        const q = parseInt(period.split("-Q")[1]);
        monthNum = q * 3;
      } else if (periodType === "weekly") {
        // "2026-W01" → берём месяц по первому дню недели
        const periodStartDate = this.getPeriodStartDate(period, periodType);
        monthNum = parseInt(periodStartDate.substring(5, 7));
      }

      const isQuarterEnd =
        monthNum === 3 || monthNum === 6 || monthNum === 9 || monthNum === 12;

      // Записываем налоги в details
      if (taxCalc) {
        // ===== P&L: начисление каждый месяц =====
        if (reportType === "pnl") {
          const isIndividual =
            Boolean(company?.is_individual) ||
            String(company?.is_individual).toLowerCase() === "true";

          details["acc-tax-insurance"] = taxCalc.insurance_amount || 0;
          details["acc-tax-ndfl"] = taxCalc.ndfl_amount || 0;

          // Фикс. взносы ИП
          if (isIndividual && taxCalc.ip_fixed_amount) {
            details["acc-tax-ip"] = taxCalc.ip_fixed_amount;
          }

          if (
            company?.tax_system === "USN_6" ||
            company?.tax_system === "USN_15"
          ) {
            details["acc-tax-vat"] = 0;
            details["acc-tax-usn"] = taxCalc.income_tax_amount;
            details["acc-tax-profit"] = 0;
          } else if (company?.tax_system === "OSNO") {
            details["acc-tax-vat"] = 0;
            details["acc-tax-usn"] = 0;
            details["acc-tax-profit"] = taxCalc.income_tax_amount;
          }
        }

        // ===== Cash Flow: уплата по факту (квартальные только в конце квартала) =====
        if (reportType === "cashflow") {
          const isIndividual =
            Boolean(company?.is_individual) ||
            String(company?.is_individual).toLowerCase() === "true";

          details["acc-tax-insurance"] = taxCalc.insurance_amount;
          details["acc-tax-ndfl"] = taxCalc.ndfl_amount;

          // Фикс. взносы ИП — из фактических транзакций acc-tax-ip
          if (isIndividual && taxCalc.ip_fixed_amount) {
            details["acc-tax-ip"] = taxCalc.ip_fixed_amount;
          }

          if (isQuarterEnd) {
            details["acc-tax-vat"] = taxCalc.vat_to_pay;

            if (
              company?.tax_system === "USN_6" ||
              company?.tax_system === "USN_15"
            ) {
              details["acc-tax-usn"] = taxCalc.income_tax_amount;
              details["acc-tax-profit"] = 0;
            } else if (company?.tax_system === "OSNO") {
              details["acc-tax-usn"] = 0;
              details["acc-tax-profit"] = taxCalc.income_tax_amount;
            }
          } else {
            details["acc-tax-vat"] = 0;
            details["acc-tax-usn"] = 0;
            details["acc-tax-profit"] = 0;
          }

          // Детализация налоговых выбытий
          details["tax_insurance"] = taxCalc.insurance_amount || 0;
          details["tax_ndfl"] = taxCalc.ndfl_amount || 0;
          details["tax_vat"] = isQuarterEnd ? taxCalc.vat_to_pay : 0;
          details["tax_income"] = isQuarterEnd ? taxCalc.income_tax_amount : 0;

          if (isIndividual && taxCalc.ip_fixed_amount) {
            details["tax_ip"] = taxCalc.ip_fixed_amount;
          }
        }
      }

      // Налоговые выбытия за период
      let taxOutflow = 0;
      if (taxCalc) {
        const isIndividual =
          Boolean(company?.is_individual) ||
          String(company?.is_individual).toLowerCase() === "true";

        const vatPayment = isQuarterEnd ? taxCalc.vat_to_pay : 0;
        const incomeTaxPayment = isQuarterEnd ? taxCalc.income_tax_amount : 0;
        const insurancePayment = taxCalc.insurance_amount || 0;
        const ndflPayment = taxCalc.ndfl_amount || 0;
        const ipFixedPayment = isIndividual ? taxCalc.ip_fixed_amount || 0 : 0;

        taxOutflow =
          insurancePayment +
          ndflPayment +
          vatPayment +
          incomeTaxPayment +
          ipFixedPayment;
      }

      // Прибыль с учётом налогов
      let profit = revenue - expenses;
      if (taxCalc && reportType === "pnl") {
        const isIndividual =
          Boolean(company?.is_individual) ||
          String(company?.is_individual).toLowerCase() === "true";

        const ipFixed = isIndividual ? taxCalc.ip_fixed_amount || 0 : 0;

        profit =
          revenue -
          expenses -
          taxCalc.income_tax_amount -
          taxCalc.insurance_amount -
          taxCalc.ndfl_amount -
          ipFixed;
      }

      const startingBalanceForPeriod = runningBalance;
      if (reportType === "cashflow") {
        runningBalance += cashIn - cashOut - taxOutflow;
      } else {
        runningBalance += cashIn - cashOut;
      }

      reports.push({
        period,
        revenue: reportType === "pnl" ? revenue : 0,
        expenses: reportType === "pnl" ? expenses : 0,
        profit: reportType === "pnl" ? profit : 0,
        cash_in: cashIn,
        cash_out: cashOut,
        tax_outflow: taxOutflow,
        net_cash_flow: cashIn - cashOut,
        starting_balance: startingBalanceForPeriod,
        ending_balance: runningBalance,
        details,
      });
    }

    return reports;
  }

  private getPeriodStartDate(period: string, periodType: PeriodType): string {
    switch (periodType) {
      case "monthly":
        return `${period}-01`;
      case "quarterly": {
        // period = "2026-Q1" | "2026-Q2" | "2026-Q3" | "2026-Q4"
        const [year, q] = period.split("-Q");
        const quarter = parseInt(q);
        const startMonth = (quarter - 1) * 3 + 1;
        return `${year}-${String(startMonth).padStart(2, "0")}-01`;
      }
      case "weekly": {
        const [year, week] = period.split("-W");
        const d = new Date(parseInt(year), 0, 1 + (parseInt(week) - 1) * 7);
        return d.toISOString().split("T")[0];
      }
      case "daily":
        return period;
      default:
        return `${period}-01`;
    }
  }

  private getPeriodEndDate(period: string, periodType: PeriodType): string {
    switch (periodType) {
      case "monthly": {
        const [year, month] = period.split("-").map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        return `${period}-${String(lastDay).padStart(2, "0")}`;
      }
      case "quarterly": {
        // period = "2026-Q1"
        const [year, q] = period.split("-Q");
        const quarter = parseInt(q);
        const endMonth = quarter * 3;
        const lastDay = new Date(parseInt(year), endMonth, 0).getDate();
        return `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      }
      case "weekly": {
        const [year, week] = period.split("-W");
        const d = new Date(parseInt(year), 0, 1 + (parseInt(week) - 1) * 7 + 6);
        return d.toISOString().split("T")[0];
      }
      case "daily":
        return period;
      default:
        return period;
    }
  }

  private getPeriodKey(date: string, periodType: PeriodType): string {
    const [year, month, day] = date.split("-");

    switch (periodType) {
      case "monthly":
        return `${year}-${month}`;
      case "quarterly": {
        const q = Math.ceil(parseInt(month) / 3);
        return `${year}-Q${q}`;
      }
      case "weekly": {
        const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const weekNumber = this.getWeekNumber(d);
        return `${year}-W${String(weekNumber).padStart(2, "0")}`;
      }
      case "daily":
        return date;
      default:
        return `${year}-${month}`;
    }
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  forecastCashFlow(
    companyId: string,
    currentBalance: number,
    startDate: string,
    days: number,
    plannedInflows: { date: string; amount: number; account: string }[],
    plannedOutflows: { date: string; amount: number; account: string }[],
  ): { date: string; balance: number; is_deficit: boolean }[] {
    const forecasts = [];
    let balance = currentBalance;

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];

      const inflow = plannedInflows
        .filter((item) => item.date === dateStr)
        .reduce((sum, item) => sum + item.amount, 0);

      const outflow = plannedOutflows
        .filter((item) => item.date === dateStr)
        .reduce((sum, item) => sum + item.amount, 0);

      balance += inflow - outflow;

      forecasts.push({
        date: dateStr,
        balance,
        is_deficit: balance < 0,
      });
    }

    return forecasts;
  }

  private calculateBalanceDetails(
    transactions: Transaction[],
    accounts: Account[],
  ): { [accountId: string]: number } {
    const details: { [accountId: string]: number } = {};

    for (const t of transactions) {
      const debitAccount = accounts.find((a) => a.id === t.debit_account_id);
      const creditAccount = accounts.find((a) => a.id === t.credit_account_id);

      if (!debitAccount || !creditAccount) continue;

      const debitIsCash = Boolean(debitAccount.is_cash_flow);
      const creditIsCash = Boolean(creditAccount.is_cash_flow);

      if (debitIsCash) {
        details[debitAccount.id] =
          (details[debitAccount.id] || 0) + t.amount_rub;
      }
      if (creditIsCash) {
        details[creditAccount.id] =
          (details[creditAccount.id] || 0) - t.amount_rub;
      }

      if (!debitIsCash && debitAccount.type === "A") {
        details[debitAccount.id] =
          (details[debitAccount.id] || 0) + t.amount_rub;
      }
      if (!creditIsCash && creditAccount.type === "A") {
        details[creditAccount.id] =
          (details[creditAccount.id] || 0) - t.amount_rub;
      }

      if (!creditIsCash && creditAccount.type === "L") {
        details[creditAccount.id] =
          (details[creditAccount.id] || 0) + t.amount_rub;
      }
      if (!debitIsCash && debitAccount.type === "L") {
        details[debitAccount.id] =
          (details[debitAccount.id] || 0) - t.amount_rub;
      }

      if (!creditIsCash && creditAccount.type === "E") {
        details[creditAccount.id] =
          (details[creditAccount.id] || 0) + t.amount_rub;
      }
      if (!debitIsCash && debitAccount.type === "E") {
        details[debitAccount.id] =
          (details[debitAccount.id] || 0) - t.amount_rub;
      }
    }

    return details;
  }

  private calculateTotalAssets(
    details: { [accountId: string]: number },
    accounts: Account[],
  ): number {
    let total = 0;
    for (const account of accounts) {
      if (account.type === "A" || account.is_cash_flow) {
        total += details[account.id] || 0;
      }
    }
    return total;
  }

  private calculateTotalLiabilities(
    details: { [accountId: string]: number },
    accounts: Account[],
  ): number {
    let total = 0;
    for (const account of accounts) {
      if (account.type === "L") {
        total += details[account.id] || 0;
      }
    }
    return total;
  }

  private calculateTotalEquity(
    details: { [accountId: string]: number },
    accounts: Account[],
  ): number {
    let total = 0;
    for (const account of accounts) {
      if (account.type === "E") {
        total += details[account.id] || 0;
      }
    }
    return total;
  }
}

export const monthlyEngine = new MonthlyEngine();
