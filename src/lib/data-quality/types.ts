/**
 * ============================================
 * FinEngine 2026 - Data Quality
 * Типы
 * ============================================
 */

export type RuleType =
  | 'must_contain'
  | 'must_not_contain'
  | 'required_field'
  | 'range'
  | 'enum'
  | 'regex';

export type EntityType = 'Transactions' | 'Accounts' | 'Companies' | 'Budgets';

export type Severity = 'critical' | 'warning' | 'info';

export type ActionType =
  | 'reassign_account'
  | 'edit_field'
  | 'delete_entity'
  | 'create_exception'
  | 'run_auto_fix';

export interface DataQualityRule {
  id: string;
  tenant_id?: string;
  name: string;
  description?: string | null;
  category: string;
  rule_type: RuleType;
  entity_type: EntityType;
  target_field: string;
  condition?: Record<string, any> | null;
  params?: Record<string, any> | null;
  problem_template?: string | null;
  explanation_template?: string | null;
  suggested_actions?: SuggestedAction[] | null;
  severity: Severity;
  is_active: boolean;
  auto_apply: boolean;
  is_deleted?: string | null;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SuggestedAction {
  id: string;
  type: ActionType;
  label: string;
  description?: string;
  config: Record<string, any>;
  requires_input?: boolean;
  input_field?: string;
  input_label?: string;
  is_destructive?: boolean;
  preview_capable: boolean;
}

export interface Violation {
  rule_id: string;
  rule_name: string;
  rule_type: RuleType;
  severity: Severity;
  entity_type: EntityType;
  entity_id: string;
  entity: any;
  problem: string;
  explanation: string;
  suggested_actions: SuggestedAction[];
}

export interface PreviewResult {
  success: boolean;
  error?: string;
  pnl_diff?: {
    revenue: number;
    cogs: number;
    opex: number;
    taxes: number;
    net_profit: number;
  };
  cashflow_diff?: {
    operating: number;
    investing: number;
    financing: number;
    ending_balance: number;
  };
  balance_diff?: {
    assets: number;
    liabilities: number;
    equity: number;
  };
  affected_accounts?: Array<{
    account_id: string;
    account_name: string;
    delta: number;
  }>;
  notes?: string[];
  before?: any;
  after?: any;
}

export interface DataQualityException {
  id: string;
  rule_id: string;
  entity_type: string;
  entity_id: string;
  reason?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface DataQualityActionLogEntry {
  id: string;
  rule_id?: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string;
  before_value?: string | null;
  after_value?: string | null;
  user_id?: string | null;
  created_at?: string;
}

export interface DataQualityRunResult {
  violations: Violation[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    rules_applied: number;
    rules_skipped: number;
  };
}
