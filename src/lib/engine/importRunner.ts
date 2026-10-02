/**
 * ============================================
 * FinEngine 2026 - Оркестратор импорта
 * ============================================
 * Маппинг + трансформации + дедупликация + запись.
 */

import { applyTransform, parseDate, parseFloat as parseFloatValue, parseInt as parseIntValue } from "./transforms";
import { makeImportHash } from "./dedup";
import { prisma } from "@/lib/prisma";

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
  warnings: string[];
}

export async function runImport(
  input: ImportRunInput,
): Promise<ImportRunResult> {
  const { source, mapping, rows, headers, file_name, user_id } = input;

  const mappingsObj: { [k: string]: string } = JSON.parse(
    mapping.mappings || "{}",
  );
  const defaults: { [k: string]: any } = JSON.parse(mapping.defaults || "{}");
  const transforms: { [k: string]: string } = JSON.parse(
    mapping.transforms || "{}",
  );
  const valueMappings: { [field: string]: { [val: string]: string } } =
    JSON.parse(mapping.value_mappings || "{}");
  const dedupKey: string[] = JSON.parse(mapping.dedup_key || "[]");

  const targetType = mapping.target_type || source.target_type;
  const batch_id = crypto.randomUUID();

  const errors: string[] = [];
  const warnings: string[] = [];
  let imported = 0;
  let skipped = 0;

  const company_id =
    input.company_id || source.company_id || defaults.company_id || "";

  // Предзагрузка хешей для дедупликации
  let existingHashes = new Set<string>();
  // Справочник существующих ОС по external_id (для upsert)
  let existingAssetsByExternalId = new Map<string, any>();

  if (targetType === "transactions") {
    const existing = await prisma.transaction.findMany({
      where: { import_hash: { not: null } },
      select: { import_hash: true },
    });
    existingHashes = new Set(
      existing.map((t) => t.import_hash!).filter(Boolean),
    );
  } else if (targetType === "fixed_assets") {
    const existing = await prisma.fixedAsset.findMany({
      where: { is_deleted: { not: "true" } },
    });
    for (const a of existing) {
      if (a.external_id) {
        existingAssetsByExternalId.set(a.external_id, a);
      }
      if (a.import_hash) {
        existingHashes.add(a.import_hash);
      }
    }
  } else if (targetType === "depreciation_entries") {
    // Загружаем существующие амортизационные транзакции (для upsert plan→fact)
    const existing = await prisma.transaction.findMany({
      where: { import_hash: { startsWith: "depreciation-" } },
      select: { id: true, import_hash: true, record_type: true },
    });
    existingHashes = new Set(
      existing.map((t) => t.import_hash!).filter(Boolean),
    );
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
        if (record[k] === undefined || record[k] === null || record[k] === "") {
          record[k] = v;
        }
      }

      // ============================================
      // 2.5. МАППИНГ ЗНАЧЕНИЙ
      // ============================================
      for (const [field, dict] of Object.entries(valueMappings)) {
        const val = record[field];
        if (
          val !== undefined &&
          val !== null &&
          dict[String(val)] !== undefined
        ) {
          record[field] = dict[String(val)];
        }
      }

      // ============================================
      // 3. СПЕЦИФИКА ПО ТИПУ
      // ============================================
      if (targetType === "transactions") {
        if (!record.date) throw new Error("Нет даты");
        if (!record.amount || record.amount <= 0)
          throw new Error("Некорректная сумма");

        // Дата в Date
        if (typeof record.date === "string") {
          record.date = new Date(record.date + "T00:00:00.000Z");
        }

        const companyId = record.company_id || company_id;
        if (!companyId) throw new Error("Нет company_id");
        record.company_id = companyId;

        // Обязательные поля
        record.amount_rub = record.amount_rub ?? record.amount;
        record.debit_account_id =
          record.debit_account_id || record.debit_account || "acc-bank-001";
        record.credit_account_id =
          record.credit_account_id || record.credit_account || "acc-out-other";
        record.counterparty_id =
          record.counterparty_id || record.counterparty || "";

        // Удаляем поля, которых нет в модели
        delete record.counterparty;
        delete record.debit_account;
        delete record.credit_account;
        delete record.document_number;

        // Тип операции
        if (!record.type) {
          const debitAcc = String(record.debit_account_id || "");
          const creditAcc = String(record.credit_account_id || "");
          if (creditAcc.startsWith("acc-in-")) {
            record.type = "income";
          } else if (
            debitAcc.startsWith("acc-bank-") &&
            creditAcc.startsWith("acc-bank-")
          ) {
            record.type = "transfer";
          } else {
            record.type = "expense";
          }
        }

        // accrual_date
        if (!record.accrual_date) {
          record.accrual_date = record.date;
        } else if (typeof record.accrual_date === "string") {
          record.accrual_date = new Date(
            record.accrual_date + "T00:00:00.000Z",
          );
        }

        // Прочее
        record.contract_id = "";
        record.transaction_group_id = "";
        record.is_system = false;
        record.external_id = record.external_id || "";
        record.source = source.type || "import";
        record.record_type =
          record.record_type || defaults.record_type || "fact";
        record.import_batch_id = batch_id;

        // Дедупликация
        const dedupFields =
          dedupKey.length > 0
            ? dedupKey
            : ["date", "amount", "company_id", "description"];

        const dateStr =
          record.date instanceof Date
            ? record.date.toISOString().split("T")[0]
            : String(record.date);

        const hash = makeImportHash(
          {
            date: dateStr,
            amount: record.amount,
            company_id: record.company_id,
            description: record.description || "",
            debit_account_id: record.debit_account_id,
            credit_account_id: record.credit_account_id,
          },
          dedupFields,
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
      } else if (targetType === "companies") {
        record.tax_system = record.tax_system || "USN_6";
        record.currency = record.currency || "RUB";
        record.is_group = false;
        record.parent_id = "";
        record.source = "import";
        record.id = crypto.randomUUID();
        await prisma.company.create({ data: record });
        imported++;
      } else if (targetType === "counterparties") {
        record.company_id = record.company_id || company_id;
        record.id = crypto.randomUUID();
        await prisma.counterparty.create({ data: record });
        imported++;
      } else if (targetType === "accounts") {
        record.id = crypto.randomUUID();
        await prisma.account.create({ data: record });
        imported++;
      } else if (targetType === "fixed_assets") {
        // ============================================
        // Импорт справочника ОС
        // ============================================
        if (!record.name) throw new Error("Нет наименования");
        if (!record.initial_cost) throw new Error("Нет первоначальной стоимости");
        if (!record.commissioning_date) throw new Error("Нет даты ввода");
        if (!record.useful_life_months) throw new Error("Нет срока полезного использования");

        const companyId = record.company_id || company_id;
        if (!companyId) throw new Error("Нет company_id");
        record.company_id = companyId;

        // Дата
        if (typeof record.commissioning_date === "string") {
          const parsedDate = parseDate(record.commissioning_date);
          if (!parsedDate) throw new Error("Некорректная дата ввода: " + record.commissioning_date);
          record.commissioning_date = new Date(parsedDate + "T00:00:00.000Z");
        }

        // Числа
        record.initial_cost = parseFloatValue(record.initial_cost);
        record.salvage_value = parseFloatValue(record.salvage_value || 0);
        record.useful_life_months = parseIntValue(record.useful_life_months);
        if (record.depreciation_group !== null && record.depreciation_group !== undefined && record.depreciation_group !== "") {
          record.depreciation_group = parseIntValue(record.depreciation_group);
        } else {
          record.depreciation_group = null;
        }

        // Удаляем поля, которых нет в модели FixedAsset
        delete record.currency;
        delete record.record_type;

        // Defaults
        record.tenant_id = "tenant-1";
        record.salvage_value = record.salvage_value || 0;
        record.depreciation_method = record.depreciation_method || "straight_line";
        record.account_id = record.account_id || "acc-fa-001";
        record.depreciation_account_id = record.depreciation_account_id || "acc-depreciation-os";
        record.status = record.status || "active";
        record.source = source.type || "import";
        record.is_deleted = "";
        record.inventory_number = record.inventory_number || "";
        record.asset_group = record.asset_group || "";
        record.external_id = record.external_id || "";
        if (record.depreciation_group) {
          record.depreciation_group = Number(record.depreciation_group);
        } else {
          record.depreciation_group = null;
        }

        // import_hash
        const faHash = record.external_id
          ? `fa-${companyId}-${record.external_id}`
          : makeImportHash(record, ["company_id", "name", "commissioning_date"]);
        record.import_hash = faHash;

        // UPSERT по external_id
        const existingAsset = record.external_id
          ? existingAssetsByExternalId.get(record.external_id)
          : null;

        if (existingAsset) {
          // Обновляем существующее ОС
          const updateData = { ...record };
          delete updateData.id;
          delete updateData.created_at;
          delete updateData.import_hash;
          await prisma.fixedAsset.update({
            where: { id: existingAsset.id },
            data: updateData,
          });
          imported++;
        } else {
          // Создаём новое
          await prisma.fixedAsset.create({
            data: {
              ...record,
              id: crypto.randomUUID(),
            },
          });
          imported++;
        }
      } else if (targetType === "depreciation_entries") {
        // ============================================
        // Импорт амортизации ОС
        // ============================================
        if (!record.date) throw new Error("Нет даты");
        if (!record.amount || record.amount <= 0) throw new Error("Некорректная сумма");

        // Дата
        if (typeof record.date === "string") {
          record.date = new Date(record.date + "T00:00:00.000Z");
        }

        const companyId = record.company_id || company_id;
        if (!companyId) throw new Error("Нет company_id");
        record.company_id = companyId;

        // Матчинг ОС по external_id ИЛИ inventory_number
        const assetKey = record.asset_external_id || record.inventory_number;
        if (!assetKey) {
          throw new Error("Нет внешнего ID или инвентарного номера ОС");
        }
        let asset = existingAssetsByExternalId.get(assetKey);
        if (!asset) {
          asset = await prisma.fixedAsset.findFirst({
            where: {
              company_id: companyId,
              OR: [
                { external_id: assetKey },
                { inventory_number: assetKey },
              ],
            },
          });
        }
        if (!asset) {
          throw new Error(`ОС с ID "${assetKey}" не найдено в системе`);
        }

        // Формируем import_hash
        const dateStr = record.date instanceof Date
          ? record.date.toISOString().split("T")[0]
          : String(record.date);
        const monthKey = dateStr.substring(0, 7); // YYYY-MM
        const depHash = `depreciation-${asset.id}-${monthKey}`;

        // ============================================
        // МЯГКАЯ ПРОВЕРКА: амортизация должна начинаться
        // с месяца, СЛЕДУЮЩЕГО за месяцем ввода в эксплуатацию.
        // Если месяц амортизации ≤ месяц ввода — это подозрительно,
        // но создаём (с warning), потому что 1С могла так настроить.
        // ============================================
        if (asset.commissioning_date) {
          const commissioningDate = new Date(asset.commissioning_date);
          const commissioningYM = `${commissioningDate.getUTCFullYear()}-${String(commissioningDate.getUTCMonth() + 1).padStart(2, "0")}`;

          if (monthKey <= commissioningYM) {
            warnings.push(
              `[WARN] Строка ${i + 2}: амортизация за ${monthKey} для ОС "${asset.name}" ` +
              `(ввод в эксплуатацию ${commissioningYM}). ` +
              `По правилу амортизация должна начинаться со следующего месяца. ` +
              `Транзакция создана, но проверьте корректность.`,
            );
          }
        }

        // Проверка plan→fact
        const existingTx = await prisma.transaction.findUnique({
          where: { import_hash: depHash },
          select: { id: true, record_type: true },
        });

        // record_type: fact, если дата ≤ сегодня, иначе plan
        const today = new Date().toISOString().split("T")[0];
        const txDateStr = dateStr; // YYYY-MM-DD
        const recordType = txDateStr <= today ? "fact" : "plan";

        const txData = {
          tenant_id: "tenant-1",
          company_id: companyId,
          date: record.date,
          accrual_date: record.date,
          description: record.description || `Амортизация ОС: ${asset.name} за ${monthKey}`,
          amount: record.amount,
          amount_rub: record.amount,
          currency: "RUB",
          type: "expense",
          debit_account_id: asset.depreciation_account_id || "acc-depreciation-os",
          credit_account_id: asset.account_id || "acc-fa-001",
          record_type: recordType,
          source: source.type || "import",
          counterparty_id: "",
          contract_id: "",
          transaction_group_id: "",
          is_system: false,
          external_id: record.external_id || "",
          source_account_id: "",
          destination_account_id: "",
          is_deleted: "",
          import_hash: depHash,
          import_batch_id: batch_id,
          updated_at: new Date(),
        };

        if (existingTx) {
          if (existingTx.record_type === "plan") {
            // UPSERT: plan → fact
            await prisma.transaction.update({
              where: { id: existingTx.id },
              data: txData,
            });
            imported++;
          } else {
            // Уже fact — пропускаем
            skipped++;
          }
        } else {
          // Создаём новую fact-транзакцию
          await prisma.transaction.create({
            data: { ...txData, id: crypto.randomUUID(), created_at: new Date() },
          });
          imported++;
        }
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
  // Объединяем warnings в errors для лога (но статус — success, если ошибок нет)
  const allMessages = [
    ...errors.map((e) => e),
    ...warnings.map((w) => w),
  ];

  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

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
      errors: allMessages.length > 0 ? JSON.stringify(allMessages.slice(0, 100)) : null,
      status: hasErrors
        ? imported > 0 ? "partial" : "failed"
        : "success",
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
    warnings,
  };
}
