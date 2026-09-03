import { Database } from '@nozbe/watermelondb';

const DOMAIN_TABLES = [
  'users',
  'categories',
  'products',
  'stock_movements',
  'transactions',
  'transaction_items',
  'payments',
  'shifts',
  'cash_drawer_pulls',
  'customers',
  'debts',
  'debt_payments',
  'settings',
] as const;

export type WipeServiceOptions = {
  now?: () => number;
};

export type WipePreview = {
  totalTransactions: number;
  totalProducts: number;
  totalCustomers: number;
  totalUsers: number;
  estimatedSizeNote: string;
};

export type WipeResult =
  | { status: 'ok' }
  | { status: 'confirmation_required' };

export class WipeService {
  private readonly database: Database;

  constructor(database: Database, _options: WipeServiceOptions = {}) {
    this.database = database;
  }

  async getPreview(): Promise<WipePreview> {
    const counts: Record<string, number> = {};
    for (const table of DOMAIN_TABLES) {
      try {
        const rows = await this.database.get(table as never).query().fetch();
        counts[table] = rows.length;
      } catch {
        counts[table] = 0;
      }
    }
    return {
      totalTransactions: counts.transactions ?? 0,
      totalProducts: counts.products ?? 0,
      totalCustomers: counts.customers ?? 0,
      totalUsers: counts.users ?? 0,
      estimatedSizeNote: `${counts.transactions ?? 0} transaksi · ${counts.products ?? 0} produk`,
    };
  }

  async wipeAll(options: { confirmed: boolean; confirmText?: string }): Promise<WipeResult> {
    if (!options.confirmed) {
      return { status: 'confirmation_required' };
    }
    if (options.confirmText !== undefined && options.confirmText !== 'HAPUS') {
      return { status: 'confirmation_required' };
    }

    const dbAny = this.database as unknown as {
      unsafeResetDatabase: () => Promise<void>;
    };
    if (typeof dbAny.unsafeResetDatabase === 'function') {
      await this.database.write(async () => {
        await dbAny.unsafeResetDatabase();
      });
      return { status: 'ok' };
    }

    await this.database.write(async () => {
      for (const table of DOMAIN_TABLES) {
        try {
          const rows = await this.database.get(table as never).query().fetch();
          for (const row of rows) {
            await (row as unknown as { destroyPermanently(): Promise<void> }).destroyPermanently();
          }
        } catch {
          // ignore for missing table
        }
      }
    });
    return { status: 'ok' };
  }
}
