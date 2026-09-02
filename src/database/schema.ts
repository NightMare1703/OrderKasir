import { appSchema, tableSchema } from '@nozbe/watermelondb';

import { withSyncColumns } from './conventions';

export const DATABASE_SCHEMA_VERSION = 7;

// v1 masih pra-rilis: users & settings dimasukkan langsung ke v1 (belum ada
// instalasi produksi, jadi tidak melanggar aturan append-only migrations).
// v2: categories & products (T1.1) lewat migrasi append-only.
// v3: custom_unit_label untuk satuan custom produk (T1.3).
// v4: stock_movements audit trail (T1.4).
// v5: transactions, transaction_items, payments (T1.8).
// v6: customers (T1.10 - needed for kas bon).
// v7: shifts, cash_drawer_pulls, debts, debt_payments (T3.1/T3.3).
export const appDatabaseSchema = appSchema({
  version: DATABASE_SCHEMA_VERSION,
  tables: [
    tableSchema({
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
    // Transaksi immutable: baris insert-only (AGENTS.md §4.3). Keunikan
    // invoice_no ditegakkan di CheckoutService (WatermelonDB tanpa UNIQUE).
    tableSchema({
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
    tableSchema({
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
    tableSchema({
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
    tableSchema({
      name: 'shifts',
      columns: withSyncColumns([
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'opened_at', type: 'number', isIndexed: true },
        { name: 'closed_at', type: 'number', isOptional: true },
        { name: 'opening_cash', type: 'number' },
        { name: 'closing_cash', type: 'number', isOptional: true },
        { name: 'expected_cash', type: 'number', isOptional: true },
        { name: 'difference', type: 'number', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ]),
    }),
    tableSchema({
      name: 'cash_drawer_pulls',
      columns: withSyncColumns([
        { name: 'shift_id', type: 'string', isIndexed: true },
        { name: 'amount', type: 'number' },
        { name: 'reason', type: 'string', isOptional: true },
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ]),
    }),
    tableSchema({
      name: 'debts',
      columns: withSyncColumns([
        { name: 'transaction_id', type: 'string', isIndexed: true },
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'total_amount', type: 'number' },
        { name: 'paid_amount', type: 'number' },
        { name: 'due_date', type: 'number', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ]),
    }),
    tableSchema({
      name: 'debt_payments',
      columns: withSyncColumns([
        { name: 'debt_id', type: 'string', isIndexed: true },
        { name: 'amount', type: 'number' },
        { name: 'method', type: 'string', isIndexed: true },
        { name: 'reference', type: 'string', isOptional: true },
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'shift_id', type: 'string', isIndexed: true },
        { name: 'paid_at', type: 'number', isIndexed: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ]),
    }),
  ],
});
