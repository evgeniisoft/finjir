/**
 * ============================================
 * FinEngine 2026 - Авто-сопоставление
 * ============================================
 * Автоматически определяет маппинг колонок и значений.
 */

// ============================================
// 1. МАППИНГ КОЛОНОК (header → target_field)
// ============================================

const HEADER_PATTERNS: { [target: string]: RegExp[] } = {
  date: [/дата/i, /date/i, /день/i],
  amount: [/сумм/i, /amount/i, /цена/i, /стоимость/i],
  description: [/описан/i, /назначен/i, /содержан/i, /коммент/i, /примечан/i],
  currency: [/валют/i, /currency/i],
  counterparty: [
    /контрагент/i,
    /плательщик/i,
    /получател/i,
    /поставщик/i,
    /покупател/i,
    /клиент/i,
  ],
  company_id: [/компан/i, /организац/i, /company/i, /фирм/i],
  debit_account: [
    /счет\s*дт/i,
    /счёт\s*дт/i,
    /дебет/i,
    /dt/i,
    /debit/i,
    /счет\s*деб/i,
    /счёт\s*деб/i,
    /^дт$/i,
  ],
  credit_account: [
    /счет\s*кт/i,
    /счёт\s*кт/i,
    /кредит/i,
    /kt/i,
    /credit/i,
    /счет\s*кред/i,
    /счёт\s*кред/i,
    /^кт$/i,
  ],
  type: [/^тип$/i, /type/i, /вид\s*опер/i],
  inn: [/инн/i],
  kpp: [/кпп/i],
  name: [/назван/i, /наименован/i, /имя/i, /name/i],
  external_id: [/внешн/i, /external/i, /номер/i, /документ/i],
  vat_rate: [/ставка\s*ндс/i, /ндс.*ставка/i],
  vat_amount: [/сумм.*ндс/i, /ндс.*сумм/i, /^ндс$/i],
  accrual_date: [/дата\s*начисл/i, /accrual/i],
};

export function suggestTargetField(
  header: string,
  availableFields: string[],
): string | null {
  const h = header.trim();

  for (const [target, patterns] of Object.entries(HEADER_PATTERNS)) {
    if (!availableFields.includes(target)) continue;
    for (const pattern of patterns) {
      if (pattern.test(h)) return target;
    }
  }
  return null;
}

// ============================================
// 2. МАППИНГ ЗНАЧЕНИЙ (value → ID)
// ============================================

/**
 * Авто-сопоставление значения счёта с Account.
 * Ищем по: source_code → code → name (частично) → id
 */
export function suggestAccountId(
  value: string,
  accounts: any[],
): string | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;

  // 1. Точное совпадение по source_code
  const bySource = accounts.find(
    (a) => String(a.source_code || "").trim() === v,
  );
  if (bySource) return bySource.id;

  // 2. По source_code с префиксом (51 → 51.01, 51.02)
  // Если в файле "51", а в БД "51.01", "51.02" — берём первый
  const bySourcePrefix = accounts
    .filter((a) => {
      const sc = String(a.source_code || "").trim();
      return sc.startsWith(v + ".");
    })
    .sort((a, b) => String(a.source_code).localeCompare(String(b.source_code)));

  if (bySourcePrefix.length > 0) return bySourcePrefix[0].id;

  // 3. Обратный префикс: в файле "51.01", а в БД "51"
  const bySourceParent = accounts.find((a) => {
    const sc = String(a.source_code || "").trim();
    return v.startsWith(sc + ".") && sc.length > 0;
  });
  if (bySourceParent) return bySourceParent.id;

  // 4. По code
  const normalized = v.replace(/^0+/, "");
  const byCode = accounts.find(
    (a) => String(a.code || "").replace(/^0+/, "") === normalized,
  );
  if (byCode) return byCode.id;

  // 5. По id
  const byId = accounts.find((a) => a.id === v);
  if (byId) return byId.id;

  // 6. По name (точное)
  const byName = accounts.find(
    (a) => String(a.name || "").toLowerCase() === v.toLowerCase(),
  );
  if (byName) return byName.id;

  // 7. По name (частичное)
  const byNamePartial = accounts.find((a) =>
    String(a.name || "")
      .toLowerCase()
      .includes(v.toLowerCase()),
  );
  if (byNamePartial) return byNamePartial.id;

  return null;
}

/**
 * Авто-сопоставление значения контрагента с Counterparty.
 */
export function suggestCounterpartyId(
  value: string,
  counterparties: any[],
): string | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;

  // 1. По id
  const byId = counterparties.find((c) => c.id === v);
  if (byId) return byId.id;

  // 2. По inn
  const byInn = counterparties.find((c) => String(c.inn || "").trim() === v);
  if (byInn) return byInn.id;

  // 3. По name
  const byName = counterparties.find(
    (c) => String(c.name || "").toLowerCase() === v.toLowerCase(),
  );
  if (byName) return byName.id;

  // 4. Частично
  const byPartial = counterparties.find((c) =>
    String(c.name || "")
      .toLowerCase()
      .includes(v.toLowerCase()),
  );
  if (byPartial) return byPartial.id;

  return null;
}

/**
 * Авто-сопоставление значения типа операции.
 */
export function suggestType(value: string): string | null {
  if (!value) return null;
  const v = String(value).toLowerCase().trim();

  if (/поступлен|доход|приход|income|in\b/.test(v)) return "income";
  if (/списан|расход|уход|оплат|expense|out\b/.test(v)) return "expense";
  if (/перемещ|перевод|transfer/.test(v)) return "transfer";

  return null;
}

/**
 * Универсальный авто-маппер значений по типу поля.
 */
export function suggestValue(
  field: string,
  value: string,
  context: {
    accounts?: any[];
    counterparties?: any[];
  },
): string | null {
  if (
    field === "debit_account_id" ||
    field === "credit_account_id" ||
    field === "debit_account" ||
    field === "credit_account"
  ) {
    return suggestAccountId(value, context.accounts || []);
  }
  if (field === "counterparty_id" || field === "counterparty") {
    return suggestCounterpartyId(value, context.counterparties || []);
  }
  if (field === "type") {
    return suggestType(value);
  }
  return null;
}
