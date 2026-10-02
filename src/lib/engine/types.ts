/**
 * ============================================
 * FinEngine 2026 - Типы данных движка
 * ============================================
 */

// Компания
export interface Company {
  id: string;
  external_id: string;      // ID из 1С
  inn: string;              // ИНН
  kpp: string;              // КПП
  name: string;
  tax_system: 'OSNO' | 'USN_6' | 'USN_15';
  currency: string;
  is_group: boolean;
  parent_id: string;
  source: 'manual' | '1c';  // Откуда пришла запись
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Новые поля
  has_employees: boolean;
  employee_count: number;
  monthly_payroll: number;
  industry_type: 'general' | 'msp_priority' | 'it';
  is_individual: boolean;
  // НОВЫЕ ПОЛЯ:
  vat_included: boolean;    // Суммы включают НДС (true для ОСНО)
  vat_rate: number;         // Ставка НДС (0 для УСН, 0.22 для ОСНО)
  vat_exempt: boolean;      // Освобождена от НДС (true для УСН)

}

// Счёт / Статья
export interface Account {
  id: string;
  code: string;
  name: string;
  type: 'A' | 'L' | 'E' | 'I' | 'X';
  is_cash_flow: boolean;
  is_cost_of_goods: boolean;
  activity_type: 'operating' | 'investing' | 'financing' | '';
  parent_id: string;
}

// Контрагент
export interface Counterparty {
  id: string;
  name: string;
  inn: string;
  type: 'client' | 'supplier';
  company_id: string;
}

// Операция
export interface Transaction {
  id: string;
  external_id: string;      // ID из 1С
  transaction_group_id: string;
  date: string;
  company_id: string;
  description: string;
  amount: number;
  currency: string;
  amount_rub: number;
  counterparty_id: string;
  contract_id: string;
  debit_account_id: string;
  credit_account_id: string;
  source: '1c' | 'manual' | 'bank';  // Источник
  is_system: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Новые поля
  tenant_id: string;
  record_type: 'fact' | 'plan';
  accrual_date: string;
  import_hash: string;
  source_account_id: string;
  destination_account_id: string;
  type: 'income' | 'expense' | 'transfer';
  // Новые поля НДС
  vat_rate: number;
  vat_amount: number;
  vat_direction: 'incoming' | 'outgoing' | 'none';
  amount_without_vat?: number;     // Опционально: Сумма без НДС
}

// Проводка (для двойной записи)
export interface JournalEntry {
  id: string;
  transaction_id: string;
  date: string;
  company_id: string;
  account_id: string;
  debit: number;
  credit: number;
  currency: string;
  amount_rub: number;
}

// Бюджет
export interface Budget {
  id: string;
  company_id: string;
  period: string; // YYYY-MM
  account_id: string;
  planned_amount: number;
  actual_amount: number;
}

// Прогноз кассовых разрывов
export interface CashFlowForecast {
  date: string;
  company_id: string;
  starting_balance: number;
  inflows: number;
  outflows: number;
  ending_balance: number;
}

// Курс валюты
export interface ExchangeRate {
  date: string;
  currency: string;
  rate: number;
}

// Отчёт ДДС
export interface CashFlowReport {
  period_start: string;
  period_end: string;
  company_id: string;
  starting_balance: number;
  operating_inflow: number;
  operating_outflow: number;
  investing_inflow: number;
  investing_outflow: number;
  financing_inflow: number;
  financing_outflow: number;
  tax_outflow: number;
  ending_balance: number;
}

// Отчёт ОПиУ
export interface PnLReport {
  period_start: string;
  period_end: string;
  company_id: string;
  revenue: number;
  cost_of_goods_sold: number;
  gross_profit: number;
  operating_expenses: number;
  insurance_amount: number;
  ndfl_amount: number;
  depreciation: number;
  taxes: number;
  net_profit: number;
}

// Баланс
export interface BalanceSheet {
  date: string;
  company_id: string;
  assets: {
    cash: number;
    accounts_receivable: number;
    inventory: number;
    fixed_assets: number;
    total: number;
  };
  liabilities: {
    accounts_payable: number;
    loans: number;
    total: number;
  };
  equity: {
    capital: number;
    retained_earnings: number;
    total: number;
  };
}

// Заказ (для юнит-экономики)
export interface Order {
  id: string;
  company_id: string;
  number: string;
  client_id: string;
  name: string;
  status: 'new' | 'in_progress' | 'completed' | 'cancelled';
  start_date: string;
  end_date: string;
  manager_id: string;
  planned_revenue: number;
  planned_costs: number;
}
// Подключение к базе данных
export interface DatabaseConnection {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql' | 'sqlite' | 'google_sheets';
  host: string;
  port: number;
  database_name: string;
  user: string;
  password: string;
  is_active: boolean;
  created_at: string;
}

// Пользователь
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'viewer';
  company_id: string;
  created_at: string;
}

// Запись аудита
export interface AuditLogEntry {
  id: string;
  user_id: string;
  action: 'create' | 'update' | 'delete' | 'import' | 'login';
  entity: string;
  entity_id: string;
  changes: string;
  timestamp: string;
}

// Уведомление
export interface Notification {
  id: string;
  user_id: string;
  type: 'cash_gap' | 'limit_warning' | 'debt_overdue' | 'sync_complete';
  message: string;
  is_read: boolean;
  timestamp: string;
}

// Источник данных
export interface DataSource {
  id: string;
  name: string;
  type: '1c' | 'excel' | 'csv' | 'sql' | 'api' | 'bank';
  config: string; // JSON строка с параметрами
  company_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: string;
  deleted_at: string;
}

// Маппинг полей
export interface DataMapping {
  id: string;
  source_id: string;
  name: string;
  mappings: string; // JSON строка: {"source_field": "target_field"}
  defaults: string; // JSON строка: {"currency": "RUB", "company_id": "..."}
  created_at: string;
  updated_at: string;
  is_deleted: string;
  deleted_at: string;
}

// Результат импорта
export interface ImportResult {
  success: boolean;
  total_rows: number;
  imported: number;
  skipped: number;
  errors: string[];
}

// Типы импортируемых данных
export type ImportTargetType =
  | 'transactions'
  | 'companies'
  | 'counterparties'
  | 'accounts'
  | 'fixed_assets'
  | 'depreciation_entries';

// Целевые поля для маппинга
export interface TargetField {
  value: string;
  label: string;
  required: boolean;
  transform?: 'parse_date' | 'parse_float' | 'parse_int' | 'uppercase' | 'none';
}

// Обновлённый маппинг
export interface DataMapping {
  id: string;
  source_id: string;
  name: string;
  target_type: ImportTargetType;
  mappings: string; // JSON: {"source_field": "target_field"}
  defaults: string; // JSON: {"currency": "RUB"}
  transforms: string; // JSON: {"amount": "parse_float", "date": "parse_date"}
  created_at: string;
  updated_at: string;
  is_deleted: string;
  deleted_at: string;
}
// Бюджетная запись
export interface Budget {
  id: string;
  tenant_id: string;
  company_id: string;
  category_id: string;
  period: string;
  planned_amount: number;
  actual_amount: number;
  record_type: 'pnl' | 'cashflow';
  scenario: 'base' | 'optimistic' | 'pessimistic';
  status: 'draft' | 'approved';
  payment_delay_days: number;
  is_deleted: string;
  deleted_at: string;
  created_at: string;
  updated_at: string;
  account_id: string;
}
