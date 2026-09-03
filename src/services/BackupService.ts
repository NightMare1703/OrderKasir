import { Database, Q } from '@nozbe/watermelondb';

import { decryptString, encryptString } from '../utils/backupCrypto';

export const BACKUP_VERSION = 1;

export type BackupTableName =
  | 'categories'
  | 'products'
  | 'customers'
  | 'users'
  | 'shifts'
  | 'cash_drawer_pulls'
  | 'transactions'
  | 'transaction_items'
  | 'payments'
  | 'stock_movements'
  | 'debts'
  | 'debt_payments'
  | 'settings';

export const BACKUP_TABLES: readonly BackupTableName[] = [
  'categories',
  'products',
  'customers',
  'users',
  'shifts',
  'cash_drawer_pulls',
  'transactions',
  'transaction_items',
  'payments',
  'stock_movements',
  'debts',
  'debt_payments',
  'settings',
] as const;

export type BackupPayload = {
  tables: Record<BackupTableName, Record<string, unknown>[]>;
};

export type BackupFile = {
  version: number;
  createdAt: number;
  deviceLabel: string;
  encrypted: boolean;
  payload?: BackupPayload;
  encryptedPayload?: string;
};

export type BackupPreview = {
  version: number;
  createdAt: number;
  deviceLabel: string;
  encrypted: boolean;
  sizeBytes: number;
  counts: Record<BackupTableName, number>;
  totalTransactions: number;
  totalProducts: number;
  totalCustomers: number;
  transactionDateRange: { min: number | null; max: number | null };
};

export type ExportOptions = {
  password?: string | null;
  deviceLabel?: string;
};

export type ImportOptions = {
  password?: string | null;
  confirmed: boolean;
};

export type PreviewResult =
  | { status: 'ok'; preview: BackupPreview }
  | { status: 'invalid_json'; error: string }
  | { status: 'invalid_version'; error: string }
  | { status: 'password_required' }
  | { status: 'decrypt_failed'; error: string };

export type ImportResult =
  | { status: 'ok'; preview: BackupPreview }
  | { status: 'invalid_json'; error: string }
  | { status: 'invalid_version'; error: string }
  | { status: 'invalid_payload'; error: string }
  | { status: 'password_required' }
  | { status: 'decrypt_failed'; error: string }
  | { status: 'confirmation_required' };

export type BackupServiceOptions = {
  now?: () => number;
};

const sanitizeDeviceLabel = (value: string | undefined, fallback: string): string => {
  if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 80);
  return fallback;
};

export class BackupService {
  private readonly database: Database;

  private readonly now: () => number;

  constructor(database: Database, options: BackupServiceOptions = {}) {
    this.database = database;
    this.now = options.now ?? Date.now;
  }

  async exportBackup(options: ExportOptions = {}): Promise<string> {
    const createdAt = this.now();
    const deviceLabel = sanitizeDeviceLabel(options.deviceLabel, 'OrderKasir');
    const payload = await this.collectPayload();

    if (options.password) {
      if (options.password.length < 4) throw new Error('password minimal 4 karakter');
      const json = JSON.stringify(payload);
      const encryptedPayload = await encryptString(json, options.password);
      const file: BackupFile = { version: BACKUP_VERSION, createdAt, deviceLabel, encrypted: true, encryptedPayload };
      return JSON.stringify(file);
    }

    const file: BackupFile = { version: BACKUP_VERSION, createdAt, deviceLabel, encrypted: false, payload };
    return JSON.stringify(file);
  }

  async previewBackup(backupJson: string, password?: string | null): Promise<PreviewResult> {
    let outer: BackupFile;
    try {
      outer = JSON.parse(backupJson) as BackupFile;
    } catch (e) {
      return { status: 'invalid_json', error: e instanceof Error ? e.message : String(e) };
    }
    if (outer.version !== BACKUP_VERSION) {
      return { status: 'invalid_version', error: `versi tidak didukung: ${String(outer.version)}` };
    }
    if (outer.encrypted) {
      if (!password) return { status: 'password_required' };
      if (!outer.encryptedPayload) return { status: 'invalid_json', error: 'encryptedPayload hilang' };
      let payloadJson: string;
      try {
        payloadJson = await decryptString(outer.encryptedPayload, password);
      } catch (e) {
        return { status: 'decrypt_failed', error: e instanceof Error ? e.message : String(e) };
      }
      let payload: BackupPayload;
      try {
        payload = JSON.parse(payloadJson) as BackupPayload;
      } catch (e) {
        return { status: 'invalid_json', error: e instanceof Error ? e.message : String(e) };
      }
      const preview = this.buildPreview(outer, payload, backupJson.length);
      return { status: 'ok', preview };
    }

    if (!outer.payload) return { status: 'invalid_json', error: 'payload hilang' };
    const preview = this.buildPreview(outer, outer.payload, backupJson.length);
    return { status: 'ok', preview };
  }

  async importBackup(backupJson: string, options: ImportOptions): Promise<ImportResult> {
    if (!options.confirmed) return { status: 'confirmation_required' };

    let outer: BackupFile;
    try {
      outer = JSON.parse(backupJson) as BackupFile;
    } catch (e) {
      return { status: 'invalid_json', error: e instanceof Error ? e.message : String(e) };
    }
    if (outer.version !== BACKUP_VERSION) {
      return { status: 'invalid_version', error: `versi tidak didukung: ${String(outer.version)}` };
    }

    let payload: BackupPayload;
    if (outer.encrypted) {
      if (!options.password) return { status: 'password_required' };
      if (!outer.encryptedPayload) return { status: 'invalid_json', error: 'encryptedPayload hilang' };
      let json: string;
      try {
        json = await decryptString(outer.encryptedPayload, options.password);
      } catch (e) {
        return { status: 'decrypt_failed', error: e instanceof Error ? e.message : String(e) };
      }
      try {
        payload = JSON.parse(json) as BackupPayload;
      } catch (e) {
        return { status: 'invalid_json', error: e instanceof Error ? e.message : String(e) };
      }
    } else {
      if (!outer.payload) return { status: 'invalid_json', error: 'payload hilang' };
      payload = outer.payload;
    }

    if (!payload.tables || typeof payload.tables !== 'object') {
      return { status: 'invalid_payload', error: 'tables hilang' };
    }
    for (const table of BACKUP_TABLES) {
      if (!Array.isArray(payload.tables[table])) {
        return { status: 'invalid_payload', error: `tabel ${table} tidak valid` };
      }
    }

    const preview = this.buildPreview(outer, payload, backupJson.length);

    await this.replaceAll(payload);

    return { status: 'ok', preview };
  }

  private buildPreview(outer: BackupFile, payload: BackupPayload, sizeBytes: number): BackupPreview {
    const counts = {} as Record<BackupTableName, number>;
    for (const table of BACKUP_TABLES) counts[table] = payload.tables[table]?.length ?? 0;

    const transactions = payload.tables.transactions ?? [];
    let min: number | null = null;
    let max: number | null = null;
    for (const raw of transactions) {
      const created = (raw as Record<string, unknown>).created_at as number | undefined;
      if (typeof created === 'number' && Number.isFinite(created)) {
        if (min === null || created < min) min = created;
        if (max === null || created > max) max = created;
      }
    }

    return {
      version: outer.version,
      createdAt: outer.createdAt,
      deviceLabel: outer.deviceLabel,
      encrypted: outer.encrypted,
      sizeBytes,
      counts,
      totalTransactions: counts.transactions,
      totalProducts: counts.products,
      totalCustomers: counts.customers,
      transactionDateRange: { min, max },
    };
  }

  private async collectPayload(): Promise<BackupPayload> {
    const tables = {} as Record<BackupTableName, Record<string, unknown>[]>;
    for (const table of BACKUP_TABLES) {
      const rows = await this.database.get(table as never).query().fetch();
      const raws = rows.map((row) => {
        const raw = (row as unknown as { _raw: Record<string, unknown> })._raw;
        return { ...raw };
      });

      if (table === 'users') {
        for (const raw of raws) {
          if ('pin_hash' in raw) delete raw.pin_hash;
        }
      }

      // Also fetch soft-deleted rows that are not returned by default query?
      // WatermelonDB query() without where returns only non-deleted? But backup
      // should include deleted markers for sync correctness. We fetch deleted separately.
      try {
        const deletedRows = await this.database
          .get(table as never)
          .query(Q.where('deleted', true))
          .fetch();
        const seen = new Set(raws.map((r) => String(r.id)));
        for (const row of deletedRows) {
          const raw = (row as unknown as { _raw: Record<string, unknown> })._raw;
          const id = String(raw.id);
          if (!seen.has(id)) {
            const copy = { ...raw };
            if (table === 'users' && 'pin_hash' in copy) delete copy.pin_hash;
            raws.push(copy);
            seen.add(id);
          }
        }
      } catch {
        // ignore if table has no deleted column (settings)
      }

      tables[table] = raws;
    }
    return { tables };
  }

  private async replaceAll(payload: BackupPayload): Promise<void> {
    const dbAny = this.database as unknown as { unsafeResetDatabase: () => Promise<void> };
    if (typeof dbAny.unsafeResetDatabase === 'function') {
      await this.database.write(async () => {
        await dbAny.unsafeResetDatabase();
        await this.insertPayload(payload);
      });
      return;
    }

    await this.database.write(async () => {
      for (const table of BACKUP_TABLES) {
        const rows = await this.database.get(table as never).query().fetch();
        for (const row of rows) {
          await (row as unknown as { destroyPermanently(): Promise<void> }).destroyPermanently();
        }
        try {
          const deletedRows = await this.database
            .get(table as never)
            .query(Q.where('deleted', true))
            .fetch();
          for (const row of deletedRows) {
            await (row as unknown as { destroyPermanently(): Promise<void> }).destroyPermanently();
          }
        } catch {
          // settings has no deleted
        }
      }
      await this.insertPayload(payload);
    });
  }

  private async insertPayload(payload: BackupPayload): Promise<void> {
    for (const table of BACKUP_TABLES) {
      const raws = payload.tables[table] ?? [];
      for (const raw of raws) {
        const copy: Record<string, unknown> = { ...raw };
        // Re-inject placeholder pin_hash for users if missing (PRD: PIN tidak ikut backup)
        if (table === 'users' && !('pin_hash' in copy)) {
          copy.pin_hash = '___MISSING_PIN_HASH___';
        }
        // WatermelonDB expects _status/_changed for sync; ensure sane defaults
        if (!('_status' in copy)) copy._status = 'synced';
        if (!('_changed' in copy)) copy._changed = '';
        if (!('id' in copy) || typeof copy.id !== 'string') continue;

        // Manual create path that works inside write for all tables:
        // We use database.get(...).create and override _raw fields after.
        // Settings has no sync columns, so we handle it specially.
        if (table === 'settings') {
          await this.database.get('settings' as never).create((model) => {
            const m = model as unknown as { _setRaw(k: string, v: unknown): void };
            m._setRaw('key', copy.key);
            m._setRaw('value', copy.value);
          });
          // Fix id to original if differs
          const created = (await this.database.get('settings' as never).query(Q.where('key', String(copy.key))).fetch())[0] as unknown as { _raw: Record<string, unknown> } | undefined;
          if (created && created._raw.id !== copy.id) {
            created._raw.id = copy.id;
          }
          continue;
        }

        await this.database.get(table as never).create((model) => {
          const m = model as unknown as { _setRaw(k: string, v: unknown): void; _raw: Record<string, unknown> };
          // Copy all fields from raw copy into model
          for (const [key, value] of Object.entries(copy)) {
            if (key === 'id' || key === '_status' || key === '_changed') continue;
            m._setRaw(key, value as never);
          }
          // Force id and sync markers
          m._raw.id = String(copy.id);
          m._raw._status = copy._status as string;
          m._raw._changed = copy._changed as string;
        });
      }
    }
  }
}
