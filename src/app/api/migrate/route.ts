import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL
  || 'https://script.google.com/macros/s/AKfycbzdcT2cZO5ynSBVMWakir1Y5aAaf5MJaqRq1C8zXDrECdaLbtT_yw3idz7FUNjpMShriw/exec';

const SECRET = 'finengine2026';

async function gasGet(sheet: string): Promise<any[]> {
  const url = `${GAS_URL}?action=getAll&sheet=${sheet}`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Нормализация типов
function toStr(v: any, def = ''): string {
  if (v === null || v === undefined || v === '') return def;
  return String(v);
}

function toStrOrNull(v: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

function toFloatOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function toBoolOrNull(v: any): boolean | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null;
}

function toDateOrNull(v: any): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function toDate(v: any): Date {
  const d = toDateOrNull(v);
  return d || new Date();
}

function normalizePeriod(v: any): string {
  const s = String(v || '').replace(/^'/, '');
  return s.substring(0, 7); // "2026-09"
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get('secret') !== SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result: any = {
    settings: 0, companies: 0, accounts: 0, counterparties: 0,
    transactions: 0, budgets: 0, users: 0, audit_log: 0,
    errors: [] as string[],
  };

  try {
    // ========== 1. SETTINGS ==========
    const settings = await gasGet('Settings');
    for (const s of settings) {
      try {
        const id = toStr(s.id) || undefined;
        await prisma.setting.upsert({
          where: { key: String(s.key) },
          create: {
            id: id || undefined,
            key: String(s.key),
            value: toStr(s.value),
            description: toStrOrNull(s.description),
            category: toStrOrNull(s.category),
            is_deleted: toStr(s.is_deleted, ''),
            deleted_at: toDateOrNull(s.deleted_at),
          },
          update: {
            value: toStr(s.value),
            description: toStrOrNull(s.description),
            category: toStrOrNull(s.category),
          },
        });
        result.settings++;
      } catch (e: any) {
        result.errors.push(`settings ${s.key}: ${e.message}`);
      }
    }

    // ========== 2. COMPANIES ==========
    const companies = await gasGet('Companies');
    for (const c of companies) {
      try {
        await prisma.company.upsert({
          where: { id: String(c.id) },
          create: {
            id: String(c.id),
            name: toStr(c.name),
            external_id: toStr(c.external_id, ''),
            inn: c.inn ? String(c.inn) : '',
            kpp: c.kpp ? String(c.kpp) : '',
            source: toStr(c.source, 'manual'),
            tax_system: toStr(c.tax_system),
            currency: toStr(c.currency, 'RUB'),
            vat_included: toBoolOrNull(c.vat_included),
            vat_rate: toFloatOrNull(c.vat_rate),
            vat_exempt: toBoolOrNull(c.vat_exempt),
            is_group: toBoolOrNull(c.is_group),
            parent_id: toStr(c.parent_id, ''),
            is_deleted: toStr(c.is_deleted, ''),
            deleted_at: toDateOrNull(c.deleted_at),
            has_employees: toBoolOrNull(c.has_employees),
            employee_count: toIntOrNull(c.employee_count),
            monthly_payroll: toFloatOrNull(c.monthly_payroll),
            industry_type: toStr(c.industry_type, 'general'),
            is_individual: toBoolOrNull(c.is_individual),
            tenant_id: toStr(c.tenant_id, 'tenant-1'),
          },
          update: {},
        });
        result.companies++;
      } catch (e: any) {
        result.errors.push(`company ${c.id}: ${e.message}`);
      }
    }

    // ========== 3. ACCOUNTS ==========
    const accounts = await gasGet('Accounts');
    for (const a of accounts) {
      try {
        await prisma.account.upsert({
          where: { id: String(a.id) },
          create: {
            id: String(a.id),
            code: toStr(a.code),
            name: toStr(a.name),
            type: toStr(a.type),
            is_cash_flow: toBoolOrNull(a.is_cash_flow),
            is_cost_of_goods: toBoolOrNull(a.is_cost_of_goods),
            activity_type: toStrOrNull(a.activity_type),
            parent_id: toStr(a.parent_id, ''),
            group_name: toStrOrNull(a.group_name),
            source_code: a.source_code ? String(a.source_code) : null,
            is_deleted: toStr(a.is_deleted, ''),
            deleted_at: toDateOrNull(a.deleted_at),
          },
          update: {},
        });
        result.accounts++;
      } catch (e: any) {
        result.errors.push(`account ${a.id}: ${e.message}`);
      }
    }

    // ========== 4. COUNTERPARTIES ==========
    const counterparties = await gasGet('Counterparties');
    for (const c of counterparties) {
      try {
        await prisma.counterparty.upsert({
          where: { id: String(c.id) },
          create: {
            id: String(c.id),
            name: toStr(c.name),
            inn: c.inn ? String(c.inn) : '',
            type: toStrOrNull(c.type),
            company_id: toStrOrNull(c.company_id),
            is_deleted: toStr(c.is_deleted, ''),
            deleted_at: toDateOrNull(c.deleted_at),
          },
          update: {},
        });
        result.counterparties++;
      } catch (e: any) {
        result.errors.push(`counterparty ${c.id}: ${e.message}`);
      }
    }

    // ========== 5. USERS ==========
    const users = await gasGet('Users');
    for (const u of users) {
      try {
        await prisma.user.upsert({
          where: { id: String(u.id) },
          create: {
            id: String(u.id),
            email: toStr(u.email),
            password: toStr(u.password || u.password_hash),
            name: toStrOrNull(u.name),
            role: toStr(u.role, 'viewer'),
            company_id: toStr(u.company_id, ''),
            is_active: toBoolOrNull(u.is_active),
            last_login: toDateOrNull(u.last_login),
            is_deleted: toStr(u.is_deleted, ''),
            deleted_at: toDateOrNull(u.deleted_at),
          },
          update: {},
        });
        result.users++;
      } catch (e: any) {
        result.errors.push(`user ${u.id}: ${e.message}`);
      }
    }

    // ========== 6. TRANSACTIONS ==========
    const transactions = await gasGet('Transactions');
    for (const t of transactions) {
      try {
        await prisma.transaction.upsert({
          where: { id: String(t.id) },
          create: {
            id: String(t.id),
            external_id: toStr(t.external_id, ''),
            transaction_group_id: toStr(t.transaction_group_id, ''),
            date: toDate(t.date),
            company_id: toStr(t.company_id),
            description: toStr(t.description, ''),
            amount: toFloatOrNull(t.amount) ?? 0,
            currency: toStr(t.currency, 'RUB'),
            amount_rub: toFloatOrNull(t.amount_rub) ?? 0,
            counterparty_id: toStr(t.counterparty_id, ''),
            contract_id: toStr(t.contract_id, ''),
            debit_account_id: toStr(t.debit_account_id),
            credit_account_id: toStr(t.credit_account_id),
            source: toStr(t.source, 'manual'),
            is_system: toBoolOrNull(t.is_system),
            is_deleted: toStr(t.is_deleted, ''),
            deleted_at: toDateOrNull(t.deleted_at),
            tenant_id: toStr(t.tenant_id, 'tenant-1'),
            record_type: toStr(t.record_type, 'fact'),
            accrual_date: toDateOrNull(t.accrual_date),
            import_hash: toStrOrNull(t.import_hash),
            source_account_id: toStr(t.source_account_id, ''),
            destination_account_id: toStr(t.destination_account_id, ''),
            type: toStr(t.type, 'expense'),
            vat_rate: toFloatOrNull(t.vat_rate),
            vat_amount: toFloatOrNull(t.vat_amount),
            vat_direction: toStrOrNull(t.vat_direction),
            amount_without_vat: toFloatOrNull(t.amount_without_vat),
          },
          update: {},
        });
        result.transactions++;
      } catch (e: any) {
        result.errors.push(`transaction ${t.id}: ${e.message}`);
      }
    }

    // ========== 7. BUDGETS ==========
    const budgets = await gasGet('Budgets');
    for (const b of budgets) {
      try {
        const id = toStr(b.id) || undefined;
        await prisma.budget.create({
          data: {
            id: id || undefined,
            tenant_id: toStr(b.tenant_id, 'tenant-1'),
            company_id: toStr(b.company_id),
            category_id: toStrOrNull(b.category_id),
            account_id: toStrOrNull(b.account_id),
            period: normalizePeriod(b.period),
            planned_amount: toFloatOrNull(b.planned_amount) ?? 0,
            actual_amount: toFloatOrNull(b.actual_amount),
            record_type: toStr(b.record_type, 'pnl'),
            scenario: toStr(b.scenario, 'base'),
            status: toStr(b.status, 'draft'),
            payment_delay_days: toIntOrNull(b.payment_delay_days),
            is_deleted: toStr(b.is_deleted, ''),
            deleted_at: toDateOrNull(b.deleted_at),
          },
        });
        result.budgets++;
      } catch (e: any) {
        result.errors.push(`budget ${b.id}: ${e.message}`);
      }
    }

    // ========== 8. AUDIT LOG ==========
    const auditLog = await gasGet('AuditLog');
    for (const a of auditLog) {
      try {
        const id = toStr(a.id) || undefined;
        await prisma.auditLogEntry.create({
          data: {
            id: id || undefined,
            user_id: toStrOrNull(a.user_id),
            action: toStr(a.action),
            entity: toStr(a.entity, ''),
            entity_id: toStr(a.entity_id, ''),
            changes: toStr(a.changes, ''),
            timestamp: toDate(a.timestamp),
          },
        });
        result.audit_log++;
      } catch (e: any) {
        result.errors.push(`audit ${a.id}: ${e.message}`);
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      partial: result,
    }, { status: 500 });
  }
}
