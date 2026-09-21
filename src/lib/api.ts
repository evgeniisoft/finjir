import { getSession } from './auth';
import { dataCache, CACHE_PREFIXES } from './cache';

export type SheetName =
  | 'Settings'
  | 'Companies'
  | 'Accounts'
  | 'Counterparties'
  | 'Transactions'
  | 'JournalEntries'
  | 'Budgets'
  | 'ExchangeRates'
  | 'Assets'
  | 'Loans'
  | 'DatabaseConnections'
  | 'AuditLog'
  | 'Users'
  | 'Notifications'
  | 'DataSources'
  | 'DataMappings'
  | 'ImportLogs';

class ApiClient {
  private baseUrl = '/api/data';

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
    };
  }

  async getAll(sheet: SheetName): Promise<any[]> {
    // Проверяем кэш
    const cached = dataCache.get(sheet);
    if (cached) {
      return cached;
    }

    try {
      const url = `${this.baseUrl}?action=getAll&sheet=${sheet}`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
        credentials: 'include',
      });
      const data = await response.json();

      if (data && data.error) {
        throw new Error(data.error);
      }

      const result = Array.isArray(data) ? data : [];

      // Кэшируем справочники дольше, операции меньше
      const ttl = sheet === 'Transactions' || sheet === 'Budgets' ? 60 : 600;
      dataCache.set(sheet, result, ttl);

      return result;
    } catch (error) {
      console.error(`Ошибка при получении данных из ${sheet}:`, error);
      throw error;
    }
  }

  async create(sheet: SheetName, data: any): Promise<any> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ action: 'create', sheet, data }),
        credentials: 'include',
      });

      const result = await response.json();

      if (result && result.error) {
        throw new Error(result.error);
      }

      // Инвалидируем кэш
      dataCache.invalidate(sheet);

      return result;
    } catch (error) {
      console.error(`Ошибка при создании записи в ${sheet}:`, error);
      throw error;
    }
  }

  async update(sheet: SheetName, id: string, data: any): Promise<any> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ action: 'update', sheet, id, data }),
        credentials: 'include',
      });

      const result = await response.json();

      if (result && result.error) {
        throw new Error(result.error);
      }

      // Инвалидируем кэш
      dataCache.invalidate(sheet);

      return result;
    } catch (error) {
      console.error(`Ошибка при обновлении записи в ${sheet}:`, error);
      throw error;
    }
  }

  async delete(sheet: SheetName, id: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}?action=delete&sheet=${sheet}&id=${encodeURIComponent(id)}`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
        credentials: 'include',
      });
      const result = await response.json();

      if (result && result.error) {
        throw new Error(result.error);
      }

      // Инвалидируем кэш
      dataCache.invalidate(sheet);

      return result.success || false;
    } catch (error) {
      console.error(`Ошибка при удалении записи из ${sheet}:`, error);
      throw error;
    }
  }

  async batchCreate(sheet: SheetName, dataArray: any[]): Promise<any> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ action: 'batchCreate', sheet, data: dataArray }),
        credentials: 'include',
      });

      const result = await response.json();

      if (result && result.error) {
        throw new Error(result.error);
      }

      // Инвалидируем кэш
      dataCache.invalidate(sheet);

      return result;
    } catch (error) {
      console.error(`Ошибка при массовом создании в ${sheet}:`, error);
      throw error;
    }
  }

  invalidateCache(sheet?: SheetName): void {
    if (sheet) {
      dataCache.invalidate(sheet);
    } else {
      dataCache.invalidateAll();
    }
  }
}

export const api = new ApiClient();
