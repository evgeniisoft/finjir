/**
 * ============================================
 * FinEngine 2026 - Оркестратор импорта
 * ============================================
 * Маппинг + трансформации + дедупликация + запись.
 */

import { applyTransform } from './transforms';
import { makeImportHash } from './dedup';
import { prisma } from '@/lib/prisma';

export interface ImportRunInput {
  source: any;
  mapping: any;
  rows: string[][];
  headers: string[];
  company_id?: string;
  user_id?: string;
  file_name?: string;
}

export interface ImportRunResult {
  batch_id: string;
  total_rows: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export async function runImport(input: ImportRunInput): Promise<ImportRunResult> {
  const { source, mapping, rows, headers, file_name, user_id } = input;

  const mappingsObj: { [k: string]: string } = JSON.parse(mapping.mappings || '{}');
  const defaults: { [k: string]: any } = JSON.parse(mapping.defaults || '{}');
  const transforms: { [k: string]: string } = JSON.parse(mapping.transforms || '{}');
  const dedupKey: string[] = JSON.parse(mapping.dedup_key || '[]');

  const targetType = mapping.target_type || source.target_type;
  const batch_id = crypto.randomUUID();

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  const company_id = input.company_id || source.company_id || defaults.company_id || '';

  // Предзагрузка хешей для дедупликации
  let existingHashes = new Set<string>();
  if (targetType === 'transactions') {
    const existing = await prisma.transaction.findMany({
      where: { import_hash: { not: null } },
      select: { import_hash: true },
    });
    existingHashes = new Set(existing.map((t) => t.import_hash!).filter(Boolean));
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      // ============================================
      // 1. МАППИНГ
      // ============================================
      const record: any = {};
      for (const [sourceCol, targetField] of Object.entries(mappingsObj)) {
        if (!targetField) continue;
        const idx = headers.indexOf(sourceCol);
        if (idx === -1) continue;
        const rawValue = row[idx];
        const transform = transforms[targetField];
        record[targetField] = applyTransform(rawValue, transform);
      }

      // ============================================
      // 2. DEFAULTS
      // ============================================
      for (const [k, v] of Object.entries(defaults)) {
        if (record[k] === undefined || record[k] === null || record[k] === '') {
          record[k] = v;
        }
      }

      // ============================================
      // 3. СПЕЦИФИКА ПО ТИПУ
      // ============================================
      if (targetType === 'transactions') {
        if (!record.date) throw new Error('Нет даты');
        if (!record.amount || record.amount <= 0) throw new Error('Некорректная сумма');

        // Дата в Date
        if (typeof record.date === 'string') {
          record.date = new Date(record.date + 'T00:00:00.000Z');
        }

        const companyId = record.company_id || company_id;
        if (!companyId) throw new Error('Нет company_id');
        record.company_id = companyId;

        // Обязательные поля
        record.amount_rub = record.amount_rub ?? record.amount;
        record.debit_account_id =
          record.debit_account_id || record.debit_account || 'acc-bank-001';
        record.credit_account_id =
          record.credit_account_id || record.credit_account || 'acc-out-other';
        record.counterparty_id =
          record.counterparty_id || record.counterparty || '';

        // Удаляем поля, которых нет в модели
        delete record.counterparty;
        delete record.debit_account;
        delete record.credit_account;
        delete record.document_number;

        // Тип операции
        if (!record.type) {
          const debitAcc = String(record.debit_account_id || '');
          const creditAcc = String(record.credit_account_id || '');
          if (creditAcc.startsWith('acc-in-')) {
            record.type = 'income';
          } else if (
            debitAcc.startsWith('acc-bank-') &&
            creditAcc.startsWith('acc-bank-')
          ) {
            record.type = 'transfer';
          } else {
            record.type = 'expense';
          }
        }

        // accrual_date
        if (!record.accrual_date) {
          record.accrual_date = record.date;
        } else if (typeof record.accrual_date === 'string') {
          record.accrual_date = new Date(record.accrual_date + 'T00:00:00.000Z');
        }

        // Прочее
        record.contract_id = '';
        record.transaction_group_id = '';
        record.is_system = false;
        record.external_id = record.external_id || '';
        record.source = source.type || 'import';
        record.record_type = record.record_type || defaults.record_type || 'fact';
        record.import_batch_id = batch_id;

        // Дедупликация
        const dedupFields =
          dedupKey.length > 0
            ? dedupKey
            : ['date', 'amount', 'company_id', 'description'];

        const dateStr =
          record.date instanceof Date
            ? record.date.toISOString().split('T')[0]
            : String(record.date);

        const hash = makeImportHash(
          {
            date: dateStr,
            amount: record.amount,
            company_id: record.company_id,
            description: record.description || '',
            debit_account_id: record.debit_account_id,
            credit_account_id: record.credit_account_id,
          },
          dedupFields
        );
        record.import_hash = hash;

        if (existingHashes.has(hash)) {
          skipped++;
          continue;
        }
        existingHashes.add(hash);

        // Удаляем поля, которые точно не нужны Prisma
        delete record.income_tax_amount;
        delete record.insurance_amount;
        delete record.ndfl_amount;
        delete record.vat_to_pay;

        await prisma.transaction.create({
          data: {
            ...record,
            id: crypto.randomUUID(),
          },
        });
        imported++;
      } else if (targetType === 'companies') {
        record.tax_system = record.tax_system || 'USN_6';
        record.currency = record.currency || 'RUB';
        record.is_group = false;
        record.parent_id = '';
        record.source = 'import';
        record.id = crypto.randomUUID();
        await prisma.company.create({ data: record });
        imported++;
      } else if (targetType === 'counterparties') {
        record.company_id = record.company_id || company_id;
        record.id = crypto.randomUUID();
        await prisma.counterparty.create({ data: record });
        imported++;
      } else if (targetType === 'accounts') {
        record.id = crypto.randomUUID();
        await prisma.account.create({ data: record });
        imported++;
      } else {
        throw new Error(`Неизвестный target_type: ${targetType}`);
      }
    } catch (e: any) {
      errors.push(`Строка ${i + 2}: ${e.message}`);
    }
  }

  // ============================================
  // ЛОГ ИМПОРТА
  // ============================================
  await prisma.importLog.create({
    data: {
      source_id: source.id,
      mapping_id: mapping.id,
      file_name: file_name || null,
      batch_id,
      total_rows: rows.length,
      imported,
      skipped,
      errors_count: errors.length,
      errors: errors.length > 0 ? JSON.stringify(errors.slice(0, 100)) : null,
      status: errors.length === 0 ? 'success' : imported > 0 ? 'partial' : 'failed',
      finished_at: new Date(),
      user_id: user_id || null,
    },
  });

  return {
    batch_id,
    total_rows: rows.length,
    imported,
    skipped,
    errors,
  };
}
