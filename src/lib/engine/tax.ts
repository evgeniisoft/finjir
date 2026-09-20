/**
 * ============================================
 * FinEngine 2026 - Налоговый движок
 * ============================================
 * Налоги считаются из ФАКТИЧЕСКИХ транзакций.
 * - Зарплата → acc-out-salary / acc-out-bonus
 * - Страховые / НДФЛ → % от фактической зарплаты
 * - Фикс. взносы ИП → acc-tax-ip
 */

import { Company, Transaction, Account, Budget } from "./types";
import { getSystemAccount } from "@/lib/config/accounts";

export interface TaxCalculation {
  company_id: string;
  company_name: string;
  tax_system: string;

  // Выручка
  revenue_with_vat: number;
  revenue_without_vat: number;
  expenses_without_vat: number;
  profit_before_tax: number;

  // НДС
  vat_rate: number;
  vat_amount: number;
  outgoing_vat: number;
  incoming_vat: number;
  vat_to_pay: number;

  // Налог на прибыль / УСН
  income_tax_rate: number;
  income_tax_amount: number;

  // Страховые взносы
  insurance_rate: number;
  insurance_amount: number;
  actual_payroll: number; // фактическая зарплата за период
  ip_fixed_amount: number; // фикс. взносы ИП за период

  // НДФЛ
  ndfl_amount: number;
  total_payroll_cost: number;

  // Итоги
  total_tax: number;
  total_tax_with_vat: number;
  effective_tax_rate: number;
}

export class TaxEngine {
  private settings: any = {};

  async loadSettings(settings: any[]) {
    for (const s of settings) {
      this.settings[s.key] = s.value;
    }
  }

  calculateTax(
    company: Company,
    transactions: Transaction[],
    accounts: Account[],
    periodStart: string,
    periodEnd: string,
  ): TaxCalculation {
    const companyTx = transactions.filter((t) => {
      const txDate = this.getDateStr(t.date);
      return (
        t.company_id === company.id &&
        txDate >= periodStart &&
        txDate <= periodEnd
      );
    });

    // Доля периода в году
    const periodFraction = this.getPeriodFraction(periodStart, periodEnd);

    // ============================================
    // НДС
    // ============================================
    const vatIncluded = String(company.vat_included).toLowerCase() === "true";
    const vatRate = vatIncluded
      ? parseFloat(
          String(company.vat_rate || this.settings["vat_osno"] || "0.22"),
        )
      : 0;

    const revenueWithVAT = companyTx
      .filter((t) => {
        const creditAccount = accounts.find(
          (a) => a.id === t.credit_account_id,
        );
        return creditAccount?.type === "I";
      })
      .reduce((sum, t) => sum + parseFloat(String(t.amount || 0)), 0);

    let revenueWithoutVAT = revenueWithVAT;
    let outgoingVAT = 0;

    if (vatIncluded && vatRate > 0) {
      revenueWithoutVAT = revenueWithVAT / (1 + vatRate);
      outgoingVAT = revenueWithVAT - revenueWithoutVAT;
    }

    const expensesWithVAT = companyTx
      .filter((t) => {
        const debitAccount = accounts.find((a) => a.id === t.debit_account_id);
        if (!debitAccount || debitAccount.type !== "X") return false;
        if (debitAccount.id.startsWith("acc-tax-")) return false;
        if (debitAccount.id.startsWith("acc-depreciation-")) return false;
        if (debitAccount.id === "acc-out-capex") return false;
        if (debitAccount.id.startsWith("acc-out-loan-")) return false;
        if (debitAccount.id === "acc-out-dividends") return false;
        return true;
      })
      .reduce((sum, t) => sum + parseFloat(String(t.amount || 0)), 0);

    let expensesWithoutVAT = expensesWithVAT;
    let incomingVATFromExpenses = 0;

    if (vatIncluded && vatRate > 0) {
      expensesWithoutVAT = expensesWithVAT / (1 + vatRate);
      incomingVATFromExpenses = expensesWithVAT - expensesWithoutVAT;
    }

    const profit = revenueWithoutVAT - expensesWithoutVAT;

    const explicitIncomingVAT = companyTx
      .filter((t) => t.vat_direction === "incoming")
      .reduce((sum, t) => sum + parseFloat(String(t.vat_amount || 0)), 0);

    const totalIncomingVAT = Math.max(
      incomingVATFromExpenses,
      explicitIncomingVAT,
    );
    const vatToPay = Math.max(0, outgoingVAT - totalIncomingVAT);

    // ============================================
    // Налог на прибыль / УСН
    // ============================================
    let incomeTaxRate = 0;
    let incomeTaxAmount = 0;

    const isPeriodPartOfYear = periodFraction < 1;
    const annualRevenueBase = isPeriodPartOfYear
      ? revenueWithoutVAT / periodFraction
      : revenueWithoutVAT;
    const annualProfitBase = isPeriodPartOfYear
      ? profit / periodFraction
      : profit;

    switch (company.tax_system) {
      case "USN_6": {
        incomeTaxRate = parseFloat(this.settings["usn_6"] || "0.06");
        const annualIncomeTax = annualRevenueBase * incomeTaxRate;
        incomeTaxAmount = isPeriodPartOfYear
          ? annualIncomeTax * periodFraction
          : annualIncomeTax;
        break;
      }
      case "USN_15": {
        incomeTaxRate = parseFloat(this.settings["usn_15"] || "0.15");
        const annualRev15 = revenueWithoutVAT / periodFraction;
        const annualExp15 = expensesWithoutVAT / periodFraction;
        const annualTaxBase15 = Math.max(0, annualRev15 - annualExp15);
        let annualIncomeTax15 = annualTaxBase15 * incomeTaxRate;
        const annualMinimumTax15 =
          annualRev15 * parseFloat(this.settings["usn_min_tax"] || "0.01");
        if (annualIncomeTax15 < annualMinimumTax15)
          annualIncomeTax15 = annualMinimumTax15;
        incomeTaxAmount = annualIncomeTax15 * periodFraction;
        break;
      }
      case "OSNO": {
        incomeTaxRate = parseFloat(this.settings["profit_tax"] || "0.25");
        const annualProfitOsno = profit / periodFraction;
        const annualIncomeTaxOsno =
          Math.max(0, annualProfitOsno) * incomeTaxRate;
        incomeTaxAmount = annualIncomeTaxOsno * periodFraction;
        break;
      }
    }

    // ============================================
    // Зарплата: ФАКТ из транзакций
    // ============================================
    const payrollAccounts = (
      this.settings["payroll_accounts"] || "acc-out-salary,acc-out-bonus"
    )
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    const payrollTx = companyTx.filter((t) =>
      payrollAccounts.includes(t.debit_account_id),
    );
    const actualPayroll = payrollTx.reduce(
      (s, t) => s + parseFloat(String(t.amount || 0)),
      0,
    );

    // ============================================
    // Фикс. взносы ИП: ФАКТ из транзакций acc-tax-ip
    // ============================================
    const ipFixedTx = companyTx.filter(
      (t) => t.debit_account_id === "acc-tax-ip",
    );
    const ipFixedAmount = ipFixedTx.reduce(
      (s, t) => s + parseFloat(String(t.amount || 0)),
      0,
    );

    // ============================================
    // Страховые взносы: % от фактической зарплаты
    // ============================================
    const insurance = this.calculateInsuranceFromPayroll(
      company,
      actualPayroll,
      periodFraction,
    );

    // Для ИП: фикс. взносы + страховые с зарплаты (если есть сотрудники)
    const insuranceAmount = company.is_individual
      ? ipFixedAmount + insurance.contributions
      : insurance.contributions;

    // ============================================
    // НДФЛ: % от фактической зарплаты
    // ============================================
    const ndflAmount = insurance.ndfl;

    const totalPayrollCost = actualPayroll + insuranceAmount + ndflAmount;

    // ============================================
    // Уменьшение УСН на взносы
    // ============================================
    let finalIncomeTax = incomeTaxAmount;
    if (company.tax_system === "USN_6") {
      const isIndividual = Boolean(company.is_individual);
      const maxReduction = isIndividual
        ? incomeTaxAmount
        : incomeTaxAmount * 0.5;
      finalIncomeTax = Math.max(
        incomeTaxAmount - Math.min(insuranceAmount, maxReduction),
        0,
      );
    }

    // ============================================
    // Итоги
    // ============================================
    const totalTax = finalIncomeTax + insuranceAmount + ndflAmount;
    const totalTaxWithVAT = totalTax + vatToPay;

    return {
      company_id: company.id,
      company_name: company.name,
      tax_system: company.tax_system,
      revenue_with_vat: Math.round(revenueWithVAT * 100) / 100,
      revenue_without_vat: Math.round(revenueWithoutVAT * 100) / 100,
      expenses_without_vat: Math.round(expensesWithoutVAT * 100) / 100,
      profit_before_tax: Math.round(profit * 100) / 100,
      vat_rate: vatRate,
      vat_amount: Math.round(outgoingVAT * 100) / 100,
      outgoing_vat: Math.round(outgoingVAT * 100) / 100,
      incoming_vat: Math.round(totalIncomingVAT * 100) / 100,
      vat_to_pay: Math.round(vatToPay * 100) / 100,
      income_tax_rate: incomeTaxRate,
      income_tax_amount: Math.round(finalIncomeTax * 100) / 100,
      insurance_rate: insurance.rate,
      insurance_amount: Math.round(insuranceAmount * 100) / 100,
      actual_payroll: Math.round(actualPayroll * 100) / 100,
      ip_fixed_amount: Math.round(ipFixedAmount * 100) / 100,
      ndfl_amount: Math.round(ndflAmount * 100) / 100,
      total_payroll_cost: Math.round(totalPayrollCost * 100) / 100,
      total_tax: Math.round(totalTax * 100) / 100,
      total_tax_with_vat: Math.round(totalTaxWithVAT * 100) / 100,
      effective_tax_rate:
        revenueWithoutVAT > 0
          ? Math.round((totalTaxWithVAT / revenueWithoutVAT) * 10000) / 100
          : 0,
    };
  }

  /**
   * Страховые взносы и НДФЛ от ФАКТИЧЕСКОЙ зарплаты за период.
   * Для периодов < год — базовая ставка без лимита (упрощённо).
   */
  calculateInsuranceFromPayroll(
    company: Company,
    actualPayroll: number,
    periodFraction: number,
  ): {
    contributions: number;
    ndfl: number;
    rate: number;
  } {
    if (actualPayroll <= 0) {
      return { contributions: 0, ndfl: 0, rate: 0 };
    }

    let contributions = 0;
    let rate = 0;

    if (company.industry_type === "it") {
      rate = parseFloat(this.settings["insurance_it_rate"] || "0.076");
      contributions = actualPayroll * rate;
    } else if (company.industry_type === "msp_priority") {
      const mrot = parseFloat(this.settings["mrot"] || "27093");
      const mspRate = parseFloat(this.settings["insurance_msp_rate"] || "0.15");
      const baseRate = parseFloat(
        this.settings["insurance_base_rate"] || "0.30",
      );
      const threshold = mrot * 1.5;
      const periodMonths = Math.max(1, Math.round(periodFraction * 12));
      const monthlyPayroll = actualPayroll / periodMonths;
      const monthlyBase = Math.min(monthlyPayroll, threshold);
      const excess = Math.max(0, monthlyPayroll - threshold);
      rate = mspRate;
      contributions =
        (monthlyBase * baseRate + excess * mspRate) * periodMonths;
    } else {
      // Упрощённо для периода < год — базовая ставка без лимита
      const limit = parseFloat(this.settings["insurance_limit"] || "2979000");
      const baseRate = parseFloat(
        this.settings["insurance_base_rate"] || "0.30",
      );
      const reducedRate = parseFloat(
        this.settings["insurance_reduced_rate"] || "0.151",
      );

      // Для года — с лимитом
      if (periodFraction >= 0.99) {
        if (actualPayroll <= limit) {
          contributions = actualPayroll * baseRate;
          rate = baseRate;
        } else {
          contributions =
            limit * baseRate + (actualPayroll - limit) * reducedRate;
          rate = reducedRate;
        }
      } else {
        // Для периода < год — без лимита (упрощённо)
        contributions = actualPayroll * baseRate;
        rate = baseRate;
      }
    }

    // НДФЛ
    const ndflLimit = parseFloat(this.settings["ndfl_limit"] || "5000000");
    const ndflBaseRate = parseFloat(this.settings["ndfl_base_rate"] || "0.13");
    const ndflIncreasedRate = parseFloat(
      this.settings["ndfl_increased_rate"] || "0.15",
    );

    let ndfl = 0;
    if (periodFraction >= 0.99) {
      if (actualPayroll <= ndflLimit) {
        ndfl = actualPayroll * ndflBaseRate;
      } else {
        ndfl =
          ndflLimit * ndflBaseRate +
          (actualPayroll - ndflLimit) * ndflIncreasedRate;
      }
    } else {
      ndfl = actualPayroll * ndflBaseRate;
    }

    return {
      contributions: Math.round(contributions * 100) / 100,
      ndfl: Math.round(ndfl * 100) / 100,
      rate: rate * 100,
    };
  }

  /**
   * Налоговый календарь на год (для планирования)
   * Использует БЮДЖЕТНЫЕ данные, не факт
   */
  getMonthlyTaxCalendar(
    company: Company,
    year: string,
    budgets: Budget[],
    budgetMonths?: string[],
  ): { month: string; taxes: { [key: string]: number } }[] {
    const months =
      budgetMonths && budgetMonths.length > 0
        ? budgetMonths.map((m) => this.getDateStr(m).substring(0, 7))
        : Array.from(
            { length: 12 },
            (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
          );

    const calendar: { month: string; taxes: { [key: string]: number } }[] = [];

    const revenueByMonth = new Map<string, number>();
    for (const budget of budgets) {
      if (budget.company_id !== company.id) continue;
      const accountId = budget.category_id || budget.account_id;
      if (accountId !== getSystemAccount("revenue")) continue;
      const rawPeriod = String(budget.period || "").replace(/^'/, "");
      const month = rawPeriod.substring(0, 7);
      revenueByMonth.set(
        month,
        (revenueByMonth.get(month) || 0) + budget.planned_amount,
      );
    }

    // Планируемая зарплата из бюджетов (аккаунты payroll_accounts)
    const payrollAccounts = (
      this.settings["payroll_accounts"] || "acc-out-salary,acc-out-bonus"
    )
      .split(",")
      .map((s: string) => s.trim());

    const payrollByMonth = new Map<string, number>();
    for (const budget of budgets) {
      if (budget.company_id !== company.id) continue;
      const accountId = budget.category_id || budget.account_id;
      if (!payrollAccounts.includes(accountId)) continue;
      const rawPeriod = String(budget.period || "").replace(/^'/, "");
      const month = rawPeriod.substring(0, 7);
      payrollByMonth.set(
        month,
        (payrollByMonth.get(month) || 0) + budget.planned_amount,
      );
    }

    const baseRate = parseFloat(this.settings["insurance_base_rate"] || "0.30");
    const ndflBaseRate = parseFloat(this.settings["ndfl_base_rate"] || "0.13");
    const ipFixed = parseFloat(
      this.settings["ip_fixed_contribution"] || "57390",
    );

    for (const monthKey of months) {
      const taxes: { [key: string]: number } = {};
      const monthRevenue = revenueByMonth.get(monthKey) || 0;
      const monthPayroll = payrollByMonth.get(monthKey) || 0;
      const monthNum = parseInt(monthKey.substring(5, 7));

      if (monthPayroll > 0) {
        taxes["acc-tax-insurance"] =
          Math.round(monthPayroll * baseRate * 100) / 100;
        taxes["acc-tax-ndfl"] =
          Math.round(monthPayroll * ndflBaseRate * 100) / 100;
      }

      if (monthNum === 4 || monthNum === 7 || monthNum === 10) {
        const vatRate = this.getVatRateForUSN(monthRevenue * 3);
        if (vatRate > 0) {
          taxes["acc-tax-vat"] =
            Math.round(monthRevenue * 3 * vatRate * 100) / 100;
        }
        if (company.tax_system === "USN_6") {
          taxes["acc-tax-usn"] =
            Math.round(monthRevenue * 3 * 0.06 * 100) / 100;
        } else if (company.tax_system === "USN_15") {
          taxes["acc-tax-usn"] =
            Math.round(monthRevenue * 3 * 0.15 * 100) / 100;
        } else if (company.tax_system === "OSNO") {
          taxes["acc-tax-profit"] =
            Math.round(monthRevenue * 3 * 0.25 * 100) / 100;
        }
      }

      if (monthNum === 12 && company.is_individual) {
        taxes["acc-tax-ip"] = ipFixed;
      }

      calendar.push({ month: monthKey, taxes });
    }

    return calendar;
  }

  private getVatRateForUSN(revenue: number): number {
    const exemptLimit = parseFloat(
      this.settings["usn_vat_exempt_limit"] || "20000000",
    );
    const rate5Limit = parseFloat(
      this.settings["usn_vat_5_limit"] || "250000000",
    );
    const rate7Limit = parseFloat(
      this.settings["usn_vat_7_limit"] || "490500000",
    );
    const rate5 = parseFloat(this.settings["vat_usn_5"] || "0.05");
    const rate7 = parseFloat(this.settings["vat_usn_7"] || "0.07");
    const standardRate = parseFloat(this.settings["vat_osno"] || "0.22");

    if (revenue <= exemptLimit) return 0;
    else if (revenue <= rate5Limit) return rate5;
    else if (revenue <= rate7Limit) return rate7;
    else return standardRate;
  }

  checkUSNLimits(
    company: Company,
    transactions: Transaction[],
  ): {
    current_revenue: number;
    limit: number;
    percentage: number;
    vat_required: boolean;
    vat_rate: number;
    usn_allowed: boolean;
    transition_required: boolean;
    transition_quarter: string | null;
    limits: {
      exempt: { threshold: number; used_percent: number; passed: boolean };
      rate_5: { threshold: number; used_percent: number; passed: boolean };
      max: { threshold: number; used_percent: number; passed: boolean };
    };
  } {
    const currentYear = new Date().getFullYear().toString();
    const yearTx = transactions.filter((t) => {
      const txDate = this.getDateStr(t.date);
      return t.company_id === company.id && txDate.startsWith(currentYear);
    });

    const revenue = yearTx
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + parseFloat(String(t.amount || 0)), 0);

    const exemptLimit = parseFloat(
      this.settings["usn_vat_exempt_limit"] || "20000000",
    );
    const rate5Limit = parseFloat(
      this.settings["usn_vat_5_limit"] || "250000000",
    );
    const maxLimit = parseFloat(
      this.settings["usn_vat_7_limit"] || "490500000",
    );

    const vatRequired = revenue > exemptLimit;
    const usnAllowed = revenue <= maxLimit;
    const transitionRequired = !usnAllowed;

    let transitionQuarter: string | null = null;
    if (transitionRequired) {
      const currentMonth = new Date().getMonth() + 1;
      const quarter = Math.ceil(currentMonth / 3);
      transitionQuarter = `${quarter} квартал ${currentYear}`;
    }

    return {
      current_revenue: revenue,
      limit: maxLimit,
      percentage: Math.round((revenue / maxLimit) * 10000) / 100,
      vat_required: vatRequired,
      vat_rate: this.getVatRateForUSN(revenue),
      usn_allowed: usnAllowed,
      transition_required: transitionRequired,
      transition_quarter: transitionQuarter,
      limits: {
        exempt: {
          threshold: exemptLimit,
          used_percent: Math.round((revenue / exemptLimit) * 1000) / 10,
          passed: revenue > exemptLimit,
        },
        rate_5: {
          threshold: rate5Limit,
          used_percent: Math.round((revenue / rate5Limit) * 1000) / 10,
          passed: revenue > rate5Limit,
        },
        max: {
          threshold: maxLimit,
          used_percent: Math.round((revenue / maxLimit) * 1000) / 10,
          passed: revenue > maxLimit,
        },
      },
    };
  }

  getMonthlyRunRate(company: Company, transactions: Transaction[]): number {
    const last3Months: string[] = [];
    const now = new Date();
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last3Months.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }

    const revenue = transactions
      .filter((t) => {
        const month = this.getDateStr(t.date).substring(0, 7);
        return (
          t.company_id === company.id &&
          last3Months.includes(month) &&
          t.credit_account_id?.startsWith("acc-in-")
        );
      })
      .reduce((sum, t) => sum + parseFloat(String(t.amount || 0)), 0);

    return revenue / 3;
  }

  private getPeriodFraction(periodStart: string, periodEnd: string): number {
    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);
    const daysInPeriod = Math.max(
      1,
      Math.round(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1,
    );
    const fraction = daysInPeriod / 365;
    return Math.min(1, Math.max(fraction, 1 / 365));
  }

  private getDateStr(date: any): string {
    if (!date) return "";
    if (typeof date === "string") return date.split("T")[0];
    if (date instanceof Date) return date.toISOString().split("T")[0];
    return String(date).split("T")[0];
  }
}

export const taxEngine = new TaxEngine();
