import { appSchema, tableSchema } from '@nozbe/watermelondb';

import { withSyncColumns } from './conventions';

export const DATABASE_SCHEMA_VERSION = 1;

// v1 masih pra-rilis: users & settings dimasukkan langsung ke v1 (belum ada
// instalasi produksi, jadi tidak melanggar aturan append-only migrations).
export const appDatabaseSchema = appSchema({
  version: DATABASE_SCHEMA_VERSION,
  tables: [
    tableSchema({
      name: 'users',
      columns: withSyncColumns([
        { name: 'name', type: 'string' },
        { name: 'pin_hash', type: 'string' },
        { name: 'role', type: 'string', isIndexed: true },
        { name: 'is_active', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ]),
    }),
    // settings adalah konfigurasi lokal per-device, bukan tabel domain:
    // tidak ikut sync, jadi tanpa last_modified/deleted (PRD §7.4.2).
    tableSchema({
      name: 'settings',
      columns: [
        { name: 'key', type: 'string', isIndexed: true },
        { name: 'value', type: 'string' },
      ],
    }),
  ],
});
