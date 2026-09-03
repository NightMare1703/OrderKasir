import { Database, Q } from '@nozbe/watermelondb';
import { synchronize } from '@nozbe/watermelondb/sync';

import Setting from '../database/models/setting';
import type { SyncAdapter } from '../database/sync';

export const LAST_PULLED_AT_KEY = 'sync_last_pulled_at';
export const LAST_SYNCED_AT_KEY = 'sync_last_synced_at';

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'syncing' | 'error';

export type SyncStatusInfo = {
  status: SyncStatus;
  pendingCount: number;
  lastPulledAt: number;
  lastSyncedAt: number | null;
  isOnline: boolean;
  error?: string;
};

export type SyncResult =
  | { status: 'ok'; timestamp: number }
  | { status: 'offline' }
  | { status: 'already_syncing' }
  | { status: 'error'; error: string };

export type SyncServiceOptions = {
  now?: () => number;
  isOnline?: () => boolean;
  debounceMs?: number;
};

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
] as const;

export class SyncService {
  private readonly database: Database;

  private readonly adapter: SyncAdapter;

  private readonly now: () => number;

  private readonly isOnlineCheck: () => boolean;

  private readonly debounceMs: number;

  private syncing = false;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private lastError: string | null = null;

  constructor(database: Database, adapter: SyncAdapter, options: SyncServiceOptions = {}) {
    this.database = database;
    this.adapter = adapter;
    this.now = options.now ?? Date.now;
    this.isOnlineCheck = options.isOnline ?? (() => true);
    this.debounceMs = options.debounceMs ?? 2000;
  }

  async getLastPulledAt(): Promise<number> {
    const rows = await this.database
      .get<Setting>('settings')
      .query(Q.where('key', LAST_PULLED_AT_KEY))
      .fetch();
    if (rows.length === 0) return 0;
    const parsed = Number.parseInt(rows[0].value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async setLastPulledAt(timestamp: number): Promise<void> {
    const value = String(timestamp);
    await this.database.write(async () => {
      const rows = await this.database
        .get<Setting>('settings')
        .query(Q.where('key', LAST_PULLED_AT_KEY))
        .fetch();
      const existing = rows[0];
      if (existing) {
        await existing.update((raw) => {
          raw.value = value;
        });
        try {
          (existing as unknown as { _raw: Record<string, unknown> })._raw._status = 'synced';
          (existing as unknown as { _raw: Record<string, unknown> })._raw._changed = '';
        } catch {
          // ignore — best-effort to avoid settings polluting pending count
        }
      } else {
        const created = await this.database.get<Setting>('settings').create((raw) => {
          raw.key = LAST_PULLED_AT_KEY;
          raw.value = value;
        });
        try {
          (created as unknown as { _raw: Record<string, unknown> })._raw._status = 'synced';
          (created as unknown as { _raw: Record<string, unknown> })._raw._changed = '';
        } catch {
          // ignore
        }
      }
    });
  }

  async getLastSyncedAt(): Promise<number | null> {
    const rows = await this.database
      .get<Setting>('settings')
      .query(Q.where('key', LAST_SYNCED_AT_KEY))
      .fetch();
    if (rows.length === 0) return null;
    const parsed = Number.parseInt(rows[0].value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async setLastSyncedAt(timestamp: number): Promise<void> {
    const value = String(timestamp);
    await this.database.write(async () => {
      const rows = await this.database
        .get<Setting>('settings')
        .query(Q.where('key', LAST_SYNCED_AT_KEY))
        .fetch();
      const existing = rows[0];
      if (existing) {
        await existing.update((raw) => {
          raw.value = value;
        });
        try {
          (existing as unknown as { _raw: Record<string, unknown> })._raw._status = 'synced';
          (existing as unknown as { _raw: Record<string, unknown> })._raw._changed = '';
        } catch {
          // ignore
        }
      } else {
        const created = await this.database.get<Setting>('settings').create((raw) => {
          raw.key = LAST_SYNCED_AT_KEY;
          raw.value = value;
        });
        try {
          (created as unknown as { _raw: Record<string, unknown> })._raw._status = 'synced';
          (created as unknown as { _raw: Record<string, unknown> })._raw._changed = '';
        } catch {
          // ignore
        }
      }
    });
  }

  async hasUnsyncedChanges(): Promise<boolean> {
    const count = await this.getPendingCount();
    return count > 0;
  }

  async getPendingCount(): Promise<number> {
    let count = 0;
    for (const table of DOMAIN_TABLES) {
      const activeRows = await this.database.get(table as never).query().fetch();
      const deletedRows = await this.database
        .get(table as never)
        .query(Q.where('deleted', true))
        .fetch();
      const seen = new Set<string>();
      const allRows: unknown[] = [];
      for (const row of [...activeRows, ...deletedRows]) {
        const id = (row as unknown as { id: string }).id;
        if (!seen.has(id)) {
          seen.add(id);
          allRows.push(row);
        }
      }
      for (const row of allRows) {
        const status = (row as unknown as { _raw: Record<string, unknown> })._raw._status as
          | string
          | undefined;
        if (status && status !== 'synced') {
          count += 1;
        }
      }
    }
    return count;
  }

  async getSyncStatus(): Promise<SyncStatusInfo> {
    const isOnline = this.isOnlineCheck();
    const lastPulledAt = await this.getLastPulledAt();
    const lastSyncedAt = await this.getLastSyncedAt();
    const pendingCount = await this.getPendingCount();
    const hasPending = pendingCount > 0;

    if (!isOnline) {
      return { status: 'offline', pendingCount, lastPulledAt, lastSyncedAt, isOnline };
    }
    if (this.syncing) {
      return { status: 'syncing', pendingCount, lastPulledAt, lastSyncedAt, isOnline };
    }
    if (this.lastError) {
      return {
        status: 'error',
        pendingCount,
        lastPulledAt,
        lastSyncedAt,
        isOnline,
        error: this.lastError,
      };
    }
    if (hasPending) {
      return { status: 'pending', pendingCount, lastPulledAt, lastSyncedAt, isOnline };
    }
    return { status: 'synced', pendingCount, lastPulledAt, lastSyncedAt, isOnline };
  }

  async synchronize(): Promise<SyncResult> {
    if (!this.isOnlineCheck()) {
      return { status: 'offline' };
    }
    if (this.syncing) {
      return { status: 'already_syncing' };
    }
    this.syncing = true;
    this.lastError = null;
    try {
      const lastPulledAt = await this.getLastPulledAt();
      let pulledTimestamp = lastPulledAt;

      await synchronize({
        database: this.database,
        pullChanges: async ({ lastPulledAt: lp, schemaVersion, migration }) => {
          const sanitizedPulledAt = typeof lp === 'number' ? lp : 0;
          const result = await this.adapter.pullChanges({
            lastPulledAt: sanitizedPulledAt,
            schemaVersion,
            migration,
          });
          pulledTimestamp = result.timestamp;
          const filteredChanges = { ...result.changes };
          if ('settings' in filteredChanges) {
            delete filteredChanges.settings;
          }
          return { changes: filteredChanges, timestamp: result.timestamp };
        },
        pushChanges: async ({ changes, lastPulledAt: lp }) => {
          const filtered = { ...changes };
          if ('settings' in filtered) {
            delete filtered.settings;
          }
          const sanitized = typeof lp === 'number' ? lp : 0;
          await this.adapter.pushChanges({ changes: filtered, lastPulledAt: sanitized });
        },
      });

      if (pulledTimestamp !== lastPulledAt) {
        await this.setLastPulledAt(pulledTimestamp);
      }
      await this.setLastSyncedAt(this.now());

      return { status: 'ok', timestamp: pulledTimestamp };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      return { status: 'error', error: message };
    } finally {
      this.syncing = false;
    }
  }

  scheduleSync(): void {
    if (!this.isOnlineCheck()) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.synchronize().catch(() => undefined);
    }, this.debounceMs);
  }

  cancelScheduledSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  clearError(): void {
    this.lastError = null;
  }
}
