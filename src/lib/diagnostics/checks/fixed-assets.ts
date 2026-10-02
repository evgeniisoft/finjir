/**
 * ============================================
 * Уровень 5: Основные средства
 * ============================================
 * Сверка справочника FixedAsset и транзакций по ОС.
 *
 * Проверяем:
 *   1. Σ FixedAsset.initial_cost  (из справочника, active, commissioning_date ≤ today)
 *   2. Σ транзакций Дт acc-fa-001 − Кт acc-fa-001  (из операций)
 *
 * Если расхождение > 5% — warning (или critical > 20%).
 * Если справочник пуст, а транзакции есть — warning.
 *
 * Смысл: в 1С справочник ОС и проводки по ОС должны совпадать.
 * Если справочник импортирован, а проводки нет — баланс будет кривой.
 */

import { DiagnosticContext, DiagnosticCheck } from '../types';
import { okCheck, problemCheck } from '../engine';
import { getRepository } from '@/lib/dal/repository';

const LEVEL = 5 as const;
const CATEGORY = 'business_rules' as const;
const THRESHOLD_PERCENT_WARNING = 5;
const THRESHOLD_PERCENT_CRITICAL = 20;

export async function runFixedAssetChecks(
  ctx: DiagnosticContext,
): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  for (const company of ctx.companies) {
    checks.push(await checkFixedAssetsReconciliation(ctx, company));
  }

  return checks;
}

async function checkFixedAssetsReconciliation(
  ctx: DiagnosticContext,
  company: any,
): Promise<DiagnosticCheck> {
  const id = `fixed_assets_reconciliation_${company.id}`;

  try {
    const repo = getRepository();

    // ============================================
    // 1. Σ FixedAsset.initial_cost (из справочника)
    // ============================================
    const allAssets = await repo.getAll('FixedAssets');

    const activeAssets = allAssets.filter((a: any) => {
      if (a.company_id !== company.id) return false;
      if (String(a.is_deleted || '').toLowerCase() === 'true') return false;
      if (a.status === 'disposed' && a.disposal_date && String(a.disposal_date).split('T')[0] <= ctx.today) {
        return false;
      }
      return true;
    });

    const initialCostTotal = activeAssets.reduce(
      (s: number, a: any) => s + Number(a.initial_cost || 0),
      0,
    );

    // ============================================
    // 2. Σ транзакций по acc-fa-001 (Дт − Кт)
    // ============================================
    const faAccountId = 'acc-fa-001';

    const companyTx = ctx.transactions.filter((t: any) => {
      if (t.company_id !== company.id) return false;
      if (String(t.is_deleted || '').toLowerCase() === 'true') return false;
      return true;
    });

    const debitSum = companyTx
      .filter((t: any) => t.debit_account_id === faAccountId)
      .reduce((s: number, t: any) => s + Number(t.amount_rub || 0), 0);

    const creditSum = companyTx
      .filter((t: any) => t.credit_account_id === faAccountId)
      .reduce((s: number, t: any) => s + Number(t.amount_rub || 0), 0);

    const transactionsTotal = debitSum - creditSum;

    // ============================================
    // 3. Сравнение
    // ============================================
    const diff = Math.abs(initialCostTotal - transactionsTotal);
    const base = Math.max(initialCostTotal, Math.abs(transactionsTotal), 1);
    const diffPercent = (diff / base) * 100;

    // Граничные случаи
    if (initialCostTotal === 0 && transactionsTotal === 0) {
      return okCheck(
        id, LEVEL, CATEGORY,
        `Сверка ОС: ${company.name}`,
        'Основных средств нет',
      );
    }

    if (initialCostTotal === 0 && transactionsTotal !== 0) {
      return problemCheck(
        id, LEVEL, CATEGORY, 'warning',
        `Сверка ОС: ${company.name}`,
        `В справочнике ОС пусто, в транзакциях ${Math.round(transactionsTotal).toLocaleString('ru-RU')} ₽`,
        {
          entity: { type: 'company', id: company.id, name: company.name },
          count: 1,
          reason: 'Транзакции по ОС есть, но справочник ОС пуст',
          recommendation: buildRecommendation('no-registry', company),
          display: {
            type: 'key_value',
            items: [
              { label: 'Справочник ОС', value: '0 ₽' },
              { label: 'Транзакции (Дт − Кт acc-fa-001)', value: `${Math.round(transactionsTotal).toLocaleString('ru-RU')} ₽`, color: 'yellow' },
            ],
          },
          details: {
            initial_cost_total: initialCostTotal,
            transactions_total: transactionsTotal,
            diff,
            diff_percent: diffPercent,
            assets_count: activeAssets.length,
          },
        },
      );
    }

    if (initialCostTotal > 0 && transactionsTotal === 0) {
      return problemCheck(
        id, LEVEL, CATEGORY, 'warning',
        `Сверка ОС: ${company.name}`,
        `В справочнике ${Math.round(initialCostTotal).toLocaleString('ru-RU')} ₽, в транзакциях 0 ₽`,
        {
          entity: { type: 'company', id: company.id, name: company.name },
          count: activeAssets.length,
          reason: 'Справочник ОС импортирован, но проводок по поступлению ОС нет',
          recommendation: buildRecommendation('no-transactions', company),
          display: {
            type: 'key_value',
            items: [
              { label: 'Справочник ОС', value: `${Math.round(initialCostTotal).toLocaleString('ru-RU')} ₽` },
              { label: 'Транзакции (Дт − Кт acc-fa-001)', value: '0 ₽', color: 'yellow' },
            ],
          },
          details: {
            initial_cost_total: initialCostTotal,
            transactions_total: transactionsTotal,
            diff,
            diff_percent: diffPercent,
            assets_count: activeAssets.length,
          },
        },
      );
    }

    if (diffPercent < THRESHOLD_PERCENT_WARNING) {
      return okCheck(
        id, LEVEL, CATEGORY,
        `Сверка ОС: ${company.name}`,
        `Справочник: ${Math.round(initialCostTotal).toLocaleString('ru-RU')} ₽. Транзакции: ${Math.round(transactionsTotal).toLocaleString('ru-RU')} ₽. Расхождение: ${diffPercent.toFixed(1)}%`,
      );
    }

    const severity = diffPercent >= THRESHOLD_PERCENT_CRITICAL ? 'critical' : 'warning';

    return problemCheck(
      id, LEVEL, CATEGORY, severity,
      `Сверка ОС: ${company.name}`,
      `В справочнике ${Math.round(initialCostTotal).toLocaleString('ru-RU')} ₽, в транзакциях ${Math.round(transactionsTotal).toLocaleString('ru-RU')} ₽. Расхождение: ${Math.round(diff).toLocaleString('ru-RU')} ₽ (${diffPercent.toFixed(1)}%)`,
      {
        entity: { type: 'company', id: company.id, name: company.name },
        count: activeAssets.length,
        reason: 'Справочник ОС и проводки по ОС не сходятся',
        recommendation: buildRecommendation('mismatch', company),
        display: {
          type: 'key_value',
          items: [
            { label: 'Справочник ОС', value: `${Math.round(initialCostTotal).toLocaleString('ru-RU')} ₽` },
            { label: 'Транзакции (Дт − Кт acc-fa-001)', value: `${Math.round(transactionsTotal).toLocaleString('ru-RU')} ₽`, color: 'yellow' },
            { label: 'Расхождение', value: `${Math.round(diff).toLocaleString('ru-RU')} ₽ (${diffPercent.toFixed(1)}%)`, color: 'red' },
          ],
        },
        details: {
          initial_cost_total: initialCostTotal,
          transactions_total: transactionsTotal,
          diff,
          diff_percent: diffPercent,
          assets_count: activeAssets.length,
          assets_names: activeAssets.slice(0, 5).map((a: any) => a.name),
        },
      },
    );
  } catch (e: any) {
    return problemCheck(
      id, LEVEL, CATEGORY, 'warning',
      `Сверка ОС: ${company.name}`,
      `Ошибка: ${e.message}`,
      { reason: e.message },
    );
  }
}

/**
 * Формирует понятную инструкцию для пользователя.
 */
function buildRecommendation(
  kind: 'no-registry' | 'no-transactions' | 'mismatch',
  company: any,
): string {
  const lines: string[] = [];

  if (kind === 'no-transactions') {
    lines.push('Что это значит: справочник ОС импортирован, но нет проводок по поступлению ОС (Дт 01 Кт 08/60). Амортизация при этом начисляется — из-за этого ОС в балансе могут уйти в минус.');
    lines.push('');
    lines.push('Что делать по шагам:');
    lines.push('1. Импортируйте журнал проводок из 1С (Источник → target_type = «Операции»). В нём должны быть проводки Дт 01 Кт 08 — поступление ОС.');
    lines.push('2. Или создайте транзакции вручную в разделе «Операции»: Дт acc-fa-001 Кт acc-out-capex на первоначальную стоимость.');
    lines.push('3. Запустите диагностику заново.');
  } else if (kind === 'no-registry') {
    lines.push('Что это значит: в операциях есть проводки по ОС, но справочник ОС пуст. Система не знает срок и дату ввода — амортизация не рассчитывается.');
    lines.push('');
    lines.push('Что делать по шагам:');
    lines.push('1. Импортируйте справочник ОС из 1С (Источник → target_type = «Основные средства»).');
    lines.push('2. Или создайте ОС вручную в разделе «Настройки → Основные средства».');
    lines.push('3. Запустите генерацию амортизации: «Настройки → Основные средства → Сгенерировать план».');
    lines.push('4. Запустите диагностику заново.');
  } else {
    lines.push('Что это значит: сумма из справочника ОС и сумма по проводкам по счёту 01 не совпадают. Обычно это происходит, если:');
    lines.push('  — справочник импортирован, а проводки — нет (или наоборот);');
    lines.push('  — ОС введено в эксплуатацию в 1С, но проводки не выгружены;');
    lines.push('  — есть выбытие ОС, которое не отражено в справочнике.');
    lines.push('');
    lines.push('Что делать по шагам:');
    lines.push('1. Сверьте список ОС в разделе «Настройки → Основные средства» со списком в 1С.');
    lines.push('2. Убедитесь, что журнал проводок из 1С импортирован полностью (поступления, выбытия).');
    lines.push('3. Если расхождение из-за того, что 1С не выгружает проводки по ОС — сообщите в поддержку, мы добавим настройку «считать ОС из справочника».');
  }

  return lines.join('\n');
}
