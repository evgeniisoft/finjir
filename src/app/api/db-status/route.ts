import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth-server';


export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const startTime = Date.now();
  let connected = false;
  let version = '';
  let errorMsg: string | null = null;

  try {
    // Проверка подключения
    await prisma.$queryRaw`SELECT 1`;
    connected = true;

    // Версия PostgreSQL
    const versionResult: any[] = await prisma.$queryRaw`SELECT version() as version`;
    const fullVersion = versionResult?.[0]?.version || '';
    const versionMatch = fullVersion.match(/PostgreSQL\s+([\d.]+)/);
    version = versionMatch ? `PostgreSQL ${versionMatch[1]}` : fullVersion.substring(0, 50);
  } catch (e: any) {
    connected = false;
    errorMsg = e.message || 'Connection failed';
  }

  // Парсим connection string (без пароля)
  let host = '';
  let database = '';
  try {
    const dbUrl = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || '';
    if (dbUrl) {
      const url = new URL(dbUrl);
      host = url.hostname;
      database = url.pathname.replace(/^\//, '');
    }
  } catch (e) {
    // ignore
  }

  const region = process.env.VERCEL_REGION || 'unknown';
  const env = process.env.VERCEL_ENV || 'development';
  const envLabel = env === 'production' ? 'production' : env === 'preview' ? 'preview' : 'development';

  // Структура БД
  let tables: { name: string; rows: number; columns: number }[] = [];
  let totalTables = 0;
  let totalRows = 0;
  let totalColumns = 0;

  if (connected) {
    try {
      // Список таблиц
      const tablesResult: any[] = await prisma.$queryRaw`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `;

      // Количество полей по таблицам
      const columnsResult: any[] = await prisma.$queryRaw`
        SELECT table_name, COUNT(*)::int as cnt
        FROM information_schema.columns
        WHERE table_schema = 'public'
        GROUP BY table_name
      `;

      const columnsMap = new Map<string, number>();
      for (const row of columnsResult) {
        columnsMap.set(row.table_name, Number(row.cnt));
      }

      // Количество записей по таблицам (параллельно)
      const tablesWithCounts = await Promise.all(
        tablesResult.map(async (t: any) => {
          const tableName = t.table_name;
          try {
            const countResult: any[] = await prisma.$queryRawUnsafe(
              `SELECT COUNT(*)::int as cnt FROM "${tableName}"`
            );
            return {
              name: tableName,
              rows: Number(countResult?.[0]?.cnt || 0),
              columns: columnsMap.get(tableName) || 0,
            };
          } catch {
            return {
              name: tableName,
              rows: 0,
              columns: columnsMap.get(tableName) || 0,
            };
          }
        })
      );

      tables = tablesWithCounts;
      totalTables = tables.length;
      totalRows = tables.reduce((s, t) => s + t.rows, 0);
      totalColumns = tables.reduce((s, t) => s + t.columns, 0);
    } catch (e: any) {
      errorMsg = e.message || 'Failed to read schema';
    }
  }

  // Обрезаем хост для безопасности
  const shortHost = host.length > 35 ? host.substring(0, 35) + '...' : host;

  return NextResponse.json({
    active: {
      name: `Neon (${envLabel})`,
      connected,
      type: version,
      host: shortHost,
      database,
      region,
      last_check: new Date().toISOString(),
      error: errorMsg,
    },
    tables,
    summary: {
      total_tables: totalTables,
      total_rows: totalRows,
      total_columns: totalColumns,
    },
    execution_time_ms: Date.now() - startTime,
  });
}
