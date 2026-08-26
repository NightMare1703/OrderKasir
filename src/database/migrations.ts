import { createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

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
  ],
});

export const migrationEvents = {
  currentVersion: DATABASE_SCHEMA_VERSION,
};
