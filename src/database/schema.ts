import { appSchema, tableSchema } from '@nozbe/watermelondb';

import { withSyncColumns } from './conventions';

export const DATABASE_SCHEMA_VERSION = 4;

// v1 masih pra-rilis: users & settings dimasukkan langsung ke v1 (belum ada
// instalasi produksi, jadi tidak melanggar aturan append-only migrations).
// v2: categories & products (T1.1) lewat migrasi append-only.
// v3: custom_unit_label untuk satuan custom produk (T1.3).
// v4: stock_movements audit trail (T1.4).
export const appDatabaseSchema = appSchema({
  version: DATABASE_SCHEMA_VERSION,
  tables: [
    tableSchema({
      name: 'categories',
      columns: withSyncColumns([
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ]),
    }),
    // Barcode "unique sparse": WatermelonDB tidak punya constraint UNIQUE di
    // level schema; keunikan (dan sparsity) ditegakkan di ProductService (T1.2).
    tableSchema({
      name: 'products',
      columns: withSyncColumns([
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'barcode', type: 'string', isIndexed: true, isOptional: true },
        { name: 'category_id', type: 'string', isIndexed: true, isOptional: true },
        { name: 'unit', type: 'string' },
        { name: 'custom_unit_label', type: 'string', isOptional: true },
        { name: 'cost_price', type: 'number' },
        { name: 'sell_price', type: 'number' },
        { name: 'stock', type: 'number' },
        { name: 'min_stock', type: 'number' },
        { name: 'is_active', type: 'boolean' },
        { name: 'photo_path', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ]),
    }),
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
    tableSchema({
      name: 'stock_movements',
      columns: withSyncColumns([
        { name: 'product_id', type: 'string', isIndexed: true },
        { name: 'type', type: 'string', isIndexed: true },
        { name: 'qty', type: 'number' },
        { name: 'stock_before', type: 'number' },
        { name: 'stock_after', type: 'number' },
        { name: 'reason', type: 'string', isOptional: true },
        { name: 'ref_type', type: 'string', isOptional: true },
        { name: 'ref_id', type: 'string', isOptional: true },
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ]),
    }),
  ],
});
