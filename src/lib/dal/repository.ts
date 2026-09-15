/**
 * ============================================
 * FinEngine 2026 - Repository Pattern (DAL)
 * ============================================
 * Абстракция над источником данных.
 * Сейчас: PostgreSQL (Neon) / Google Sheets через GAS
 */

import { prisma } from "@/lib/prisma";

export interface Repository {
  getAll(entity: string): Promise<any[]>;
  getById(entity: string, id: string): Promise<any>;
  create(entity: string, data: any): Promise<any>;
  update(entity: string, id: string, data: any): Promise<any>;
  delete(entity: string, id: string): Promise<boolean>;
  batchCreate(entity: string, dataArray: any[]): Promise<any>;
  deleteByHash(entity: string, hash: string): Promise<any>;
}

// ============================================
// Маппинг entity (имя листа GAS) → модель Prisma
// ============================================
const ENTITY_TO_MODEL: Record<string, string> = {
  Settings: "setting",
  Companies: "company",
  Accounts: "account",
  Counterparties: "counterparty",
  Transactions: "transaction",
  Budgets: "budget",
  Users: "user",
  AuditLog: "auditLogEntry",
  ExchangeRates: "exchangeRate",
  JournalEntries: "journalEntry",
};

const MODEL_TO_TABLE: Record<string, string> = {
  setting: "settings",
  company: "companies",
  account: "accounts",
  counterparty: "counterparties",
  transaction: "transactions",
  budget: "budgets",
  user: "users",
  auditLogEntry: "audit_log",
  exchangeRate: "exchange_rates",
  journalEntry: "journal_entries",
};

function getModel(entity: string): any {
  const modelName = ENTITY_TO_MODEL[entity];
  if (!modelName) {
    throw new Error(`Неизвестная сущность: ${entity}`);
  }
  return (prisma as any)[modelName];
}

// ============================================
// Нормализация дат: Prisma Date → ISO-строка (как было в GAS)
// ============================================
const DATE_FIELDS: Record<string, string[]> = {
  transactions: ["date", "accrual_date"],
  companies: ["deleted_at"],
  accounts: ["deleted_at"],
  counterparties: ["deleted_at"],
  users: ["last_login", "deleted_at"],
  audit_log: ["timestamp"],
  exchange_rates: ["date"],
  journal_entries: ["date"],
};
const BOOLEAN_FIELDS: Record<string, string[]> = {
  companies: [
    "vat_included",
    "vat_exempt",
    "is_group",
    "is_individual",
    "has_employees",
  ],
  accounts: ["is_cash_flow", "is_cost_of_goods"],
  transactions: ["is_system"],
  users: ["is_active"],
};

function normalizeInputBooleans(data: any, entity: string): any {
  const modelName = ENTITY_TO_MODEL[entity];
  if (!modelName) return data;
  const tableName = MODEL_TO_TABLE[modelName];
  const fields = BOOLEAN_FIELDS[tableName] || [];
  const result = { ...data };
  for (const field of fields) {
    const v = result[field];
    if (typeof v === "string") {
      const s = v.toLowerCase();
      if (s === "true") result[field] = true;
      else if (s === "false") result[field] = false;
      else if (v === "") result[field] = null;
    }
  }
  return result;
}

function normalizeInputDates(data: any, entity: string): any {
  const modelName = ENTITY_TO_MODEL[entity];
  if (!modelName) return data;
  const tableName = MODEL_TO_TABLE[modelName];
  const fields = DATE_FIELDS[tableName] || [];
  const result = { ...data };
  for (const field of fields) {
    const v = result[field];
    if (typeof v === "string" && v.length > 0) {
      // "2026-09-15" → "2026-09-15T00:00:00.000Z"
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        result[field] = new Date(v + "T00:00:00.000Z");
      } else {
        // "2026-09-15T10:30:00.000Z" → Date
        const d = new Date(v);
        if (!isNaN(d.getTime())) {
          result[field] = d;
        }
      }
    }
  }
  return result;
}

function normalizeDates(row: any, entity: string): any {
  const modelName = ENTITY_TO_MODEL[entity];
  if (!modelName) return row;
  const tableName = MODEL_TO_TABLE[modelName];
  const fields = DATE_FIELDS[tableName] || [];
  const result = { ...row };
  for (const field of fields) {
    const v = result[field];
    if (v instanceof Date) {
      result[field] = v.toISOString();
    }
  }
  return result;
}

// ============================================
// SheetsRepository — для отката
// ============================================
class SheetsRepository implements Repository {
  private baseUrl: string;

  constructor() {
    this.baseUrl =
      process.env.GAS_URL ||
      process.env.NEXT_PUBLIC_GAS_URL ||
      "https://script.google.com/macros/s/AKfycbzdcT2cZO5ynSBVMWakir1Y5aAaf5MJaqRq1C8zXDrECdaLbtT_yw3idz7FUNjpMShriw/exec";
  }

  async getAll(entity: string): Promise<any[]> {
    const model = getModel(entity);
    const rows = await model.findMany();
    return rows.map((row: any) => {
      const normalized = normalizeDates(row, entity);
      // Скрываем пароль при чтении Users
      if (entity === "Users" && normalized.password !== undefined) {
        delete normalized.password;
      }
      return normalized;
    });
  }

  async getById(entity: string, id: string): Promise<any> {
    const url = `${this.baseUrl}?action=getById&sheet=${entity}&id=${encodeURIComponent(id)}`;
    const response = await fetch(url, { cache: "no-store" });
    return response.json();
  }

  async create(entity: string, data: any): Promise<any> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", sheet: entity, data }),
    });
    return response.json();
  }

  async update(entity: string, id: string, data: any): Promise<any> {
    const url = `${this.baseUrl}?action=update&sheet=${entity}&id=${encodeURIComponent(id)}&data=${encodeURIComponent(JSON.stringify(data))}`;
    const response = await fetch(url);
    return response.json();
  }

  async delete(entity: string, id: string): Promise<boolean> {
    const url = `${this.baseUrl}?action=delete&sheet=${entity}&id=${encodeURIComponent(id)}`;
    const response = await fetch(url);
    const result = await response.json();
    return result.success || false;
  }

  async batchCreate(entity: string, dataArray: any[]): Promise<any> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "batchCreate",
        sheet: entity,
        data: dataArray,
      }),
    });
    return response.json();
  }

  async deleteByHash(entity: string, hash: string): Promise<any> {
    const url = `${this.baseUrl}?action=deleteByHash&sheet=${entity}&hash=${encodeURIComponent(hash)}`;
    const response = await fetch(url);
    return response.json();
  }
}

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================
// PostgresRepository — реализация через Prisma
// ============================================
class PostgresRepository implements Repository {
  async getAll(entity: string): Promise<any[]> {
    const model = getModel(entity);
    const rows = await model.findMany();
    return rows.map((row: any) => {
      const normalized = normalizeDates(row, entity);
      // Скрываем пароль при чтении Users
      if (entity === "Users" && normalized.password !== undefined) {
        delete normalized.password;
      }
      return normalized;
    });
  }

  async getById(entity: string, id: string): Promise<any> {
    const model = getModel(entity);
    const row = await model.findUnique({ where: { id } });
    return row ? normalizeDates(row, entity) : null;
  }

  async create(entity: string, data: any): Promise<any> {
    const model = getModel(entity);
    let clean = { ...data };
    if (!clean.id || clean.id === "") {
      clean.id = generateId();
    }
    clean = normalizeInputDates(clean, entity);
    clean = normalizeInputBooleans(clean, entity);
    for (const key of Object.keys(clean)) {
      if (clean[key] === "") {
        if (key.endsWith("_at") || key.endsWith("_date")) {
          clean[key] = null;
        }
      }
    }
    const row = await model.create({ data: clean });
    return normalizeDates(row, entity);
  }

  async update(entity: string, id: string, data: any): Promise<any> {
    const model = getModel(entity);
    let clean = { ...data };
    delete clean.id;
    clean = normalizeInputDates(clean, entity);
    clean = normalizeInputBooleans(clean, entity);
    for (const key of Object.keys(clean)) {
      if (clean[key] === "") {
        if (key.endsWith("_at") || key.endsWith("_date")) {
          clean[key] = null;
        }
      }
    }
    const row = await model.update({ where: { id }, data: clean });
    return normalizeDates(row, entity);
  }

  async delete(entity: string, id: string): Promise<boolean> {
    const model = getModel(entity);
    try {
      await model.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async batchCreate(entity: string, dataArray: any[]): Promise<any> {
    const model = getModel(entity);
    const cleanArray = dataArray.map((d) => {
      let clean = { ...d };
      if (!clean.id || clean.id === "") {
        clean.id = generateId();
      }
      clean = normalizeInputDates(clean, entity);
      clean = normalizeInputBooleans(clean, entity);
      for (const key of Object.keys(clean)) {
        if (clean[key] === "") {
          if (key.endsWith("_at") || key.endsWith("_date")) {
            clean[key] = null;
          }
        }
      }
      return clean;
    });
    const result = await model.createMany({
      data: cleanArray,
      skipDuplicates: true,
    });
    return { success: true, count: result.count };
  }

  async deleteByHash(entity: string, hash: string): Promise<any> {
    const model = getModel(entity);
    try {
      const result = await model.deleteMany({ where: { import_hash: hash } });
      return { success: true, count: result.count };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}

// ============================================
// Фабрика
// ============================================
let repositoryInstance: Repository | null = null;

export function getRepository(): Repository {
  if (!repositoryInstance) {
    const dbType = process.env.DB_TYPE || "postgresql";
    if (dbType === "sheets") {
      repositoryInstance = new SheetsRepository();
    } else {
      repositoryInstance = new PostgresRepository();
    }
  }
  return repositoryInstance;
}

export const repository = getRepository();
