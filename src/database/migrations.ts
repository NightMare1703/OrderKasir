import { addColumns, createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

import { withSyncColumns } from './conventions';

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
    {
      toVersion: 5,
      steps: [
        createTable({
          name: 'transactions',
          columns: withSyncColumns([
            { name: 'invoice_no', type: 'string', isIndexed: true },
            { name: 'shift_id', type: 'string', isIndexed: true },
            { name: 'user_id', type: 'string', isIndexed: true },
            { name: 'customer_id', type: 'string', isIndexed: true, isOptional: true },
            { name: 'subtotal', type: 'number' },
            { name: 'discount', type: 'number' },
            { name: 'tax', type: 'number' },
            { name: 'total', type: 'number' },
            { name: 'status', type: 'string', isIndexed: true },
            { name: 'void_reason', type: 'string', isOptional: true },
            { name: 'void_by_user_id', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
          ]),
        }),
        createTable({
          name: 'transaction_items',
          columns: withSyncColumns([
            { name: 'transaction_id', type: 'string', isIndexed: true },
            { name: 'product_id', type: 'string', isIndexed: true },
            { name: 'product_name_snapshot', type: 'string' },
            { name: 'unit_snapshot', type: 'string' },
            { name: 'qty', type: 'number' },
            { name: 'unit_price', type: 'number' },
            { name: 'discount', type: 'number' },
            { name: 'total', type: 'number' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ]),
        }),
        createTable({
          name: 'payments',
          columns: withSyncColumns([
            { name: 'transaction_id', type: 'string', isIndexed: true },
            { name: 'method', type: 'string', isIndexed: true },
            { name: 'amount', type: 'number' },
            { name: 'reference', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ]),
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        createTable({
          name: 'customers',
          columns: withSyncColumns([
            { name: 'name', type: 'string', isIndexed: true },
            { name: 'phone', type: 'string', isOptional: true },
            { name: 'note', type: 'string', isOptional: true },
            { name: 'debt_limit', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ]),
        }),
      ],
    },
  ],
});

export const migrationEvents = {
  currentVersion: 6,
};
