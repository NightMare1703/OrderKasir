import { addColumns, createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

import { withSyncColumns } from './conventions';
import { DATABASE_SCHEMA_VERSION } from './schema';

// Append-only: tambah entri baru per versi schema, jangan pernah mengubah yang sudah rilis.
export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'categories',
          columns: withSyncColumns([
            { name: 'name', type: 'string', isIndexed: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ]),
        }),
        createTable({
          name: 'products',
          columns: withSyncColumns([
            { name: 'name', type: 'string', isIndexed: true },
            { name: 'barcode', type: 'string', isIndexed: true, isOptional: true },
            { name: 'category_id', type: 'string', isIndexed: true, isOptional: true },
            { name: 'unit', type: 'string' },
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
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'products',
          columns: [{ name: 'custom_unit_label', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        createTable({
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
    },
  ],
});

export const migrationEvents = {
  currentVersion: DATABASE_SCHEMA_VERSION,
};
