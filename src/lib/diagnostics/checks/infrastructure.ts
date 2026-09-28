/**
 * ============================================
 * Уровень 6: Инфраструктура
 * ============================================
 * После миграции на Neon проверки GAS-квоты и кэша неактуальны.
 * Оставлены только те, что имеют смысл.
 */

import { DiagnosticContext, DiagnosticCheck } from '../types';
import { okCheck } from '../engine';

const LEVEL = 6 as const;
const CATEGORY = 'infrastructure' as const;

export async function runInfrastructureChecks(ctx: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  // 6.1 Скорость загрузки данных
  checks.push(checkDataLoadSpeed(ctx));

  return checks;
}

// ============================================
// 6.1 Скорость загрузки данных (Neon)
// ============================================
function checkDataLoadSpeed(ctx: DiagnosticContext): DiagnosticCheck {
  const loadMs = ctx.gasLoadTime;
  const seconds = (loadMs / 1000).toFixed(2);

  if (loadMs > 5000) {
    return {
      id: 'data_load_speed',
      level: LEVEL,
      category: CATEGORY,
      severity: 'critical',
      name: 'Скорость загрузки данных',
      message: `Загрузка всех данных: ${seconds} сек (критично)`,
      recommendation: 'Проверьте индексы в Neon, оптимизируйте запросы',
      details: { load_time_ms: loadMs },
    };
  }

  if (loadMs > 2000) {
    return {
      id: 'data_load_speed',
      level: LEVEL,
      category: CATEGORY,
      severity: 'warning',
      name: 'Скорость загрузки данных',
      message: `Загрузка всех данных: ${seconds} сек`,
      recommendation: 'Проверьте объём данных',
      details: { load_time_ms: loadMs },
    };
  }

  return okCheck(
    'data_load_speed', LEVEL, CATEGORY,
    'Скорость загрузки данных',
    `Загрузка: ${seconds} сек`,
    {
      display: {
        type: 'key_value',
        items: [
          { label: 'Время загрузки', value: `${seconds} сек`, color: 'green', bold: true },
        ],
      },
    }
  );
}
