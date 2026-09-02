import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';

import CashDrawerPull from '../../database/models/cash-drawer-pull';
import Category from '../../database/models/category';
import Customer from '../../database/models/customer';
import Debt from '../../database/models/debt';
import DebtPayment from '../../database/models/debt-payment';
import Payment from '../../database/models/payment';
import Product from '../../database/models/product';
import Setting from '../../database/models/setting';
import Shift from '../../database/models/shift';
import StockMovement from '../../database/models/stock-movement';
import Transaction from '../../database/models/transaction';
import TransactionItem from '../../database/models/transaction-item';
import User from '../../database/models/user';
import { appDatabaseSchema } from '../../database/schema';
import { CheckoutInput, CheckoutService } from '../CheckoutService';

logger.silence();

const makeDb = () => {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    extraLokiOptions: { autosave: false },
  });
  return new Database({
    adapter,
    modelClasses: [
      CashDrawerPull,
      Category,
      Customer,
      Debt,
      DebtPayment,
      Payment,
      Product,
      Setting,
      Shift,
      StockMovement,
      Transaction,
      TransactionItem,
      User,
    ],
  });
};

type TestHarness = {
  db: Database;
  service: CheckoutService;
  now: () => number;
};

const FIXED_NOW = new Date(2026, 7, 27, 14, 5, 0).getTime();

const makeHarness = (): TestHarness => {
  const db = makeDb();
  let currentTime = FIXED_NOW;
  const service = new CheckoutService(db, { now: () => currentTime });
  return { db, service, now: () => currentTime };
};

const createProduct = async (
  db: Database,
  overrides: Partial<{
    stock: number;
    name: string;
    unit: string;
    customUnitLabel: string | null;
    sellPrice: number;
  }> = {},
): Promise<Product> => {
  const {
    stock = 50,
    name = 'Indomie Goreng',
    unit = 'pcs',
    customUnitLabel = null,
    sellPrice = 3_500,
  } = overrides;
  let created: Product | undefined;
  await db.write(async () => {
    created = await db.get<Product>('products').create((raw) => {
      raw.name = name;
      raw.barcode = null;
      raw.categoryId = null;
      raw.unit = unit as Product['unit'];
      raw.customUnitLabel = customUnitLabel;
      raw.costPrice = 2_500;
      raw.sellPrice = sellPrice;
      raw.stock = stock;
      raw.minStock = 5;
      raw.isActive = true;
      raw.createdAt = 1;
      raw.updatedAt = 1;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', 1);
    });
  });
  if (!created) throw new Error('gagal membuat produk uji');
  return created;
};

const createUser = async (db: Database): Promise<User> => {
  let created: User | undefined;
  await db.write(async () => {
    created = await db.get<User>('users').create((record) => {
      record.name = 'Budi';
      record.pinHash = 'plain$1234';
      record.role = 'admin';
      record.isActive = true;
      record.createdAt = 1;
      record.updatedAt = 1;
      record._setRaw('deleted', false);
      record._setRaw('last_modified', 1);
    });
  });
  if (!created) throw new Error('gagal membuat user uji');
  return created;
};

const count = async (db: Database, table: string): Promise<number> => {
  const rows = await db.get(table as never).query().fetch();
  return rows.length;
};

const makeBaseInput = (
  userId: string,
  items: CheckoutInput['items'],
  payments: CheckoutInput['payments'],
): CheckoutInput => ({
  shiftId: 'shift-1',
  userId,
  items,
  transactionDiscount: 0,
  tax: 0,
  payments,
  status: 'paid',
});

describe('CheckoutService - atomicity & snapshot (T1.8)', () => {
  it('menulis transaksi + item + payment + movement + stok dalam satu commit', async () => {
    const { db, service, now } = makeHarness();
    const product = await createProduct(db, { stock: 20, name: 'Teh Pucuk 350ml' });
    const user = await createUser(db);

    const result = await service.checkout(
      makeBaseInput(
        user.id,
        [{ productId: product.id, qty: 3, unitPrice: 4_000, discount: 0 }],
        [{ method: 'cash', amount: 12_000 }],
      ),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.invoiceNo).toBe('INV-20260827-0001');
    const transaction = result.transaction;
    expect(transaction.invoiceNo).toBe('INV-20260827-0001');
    expect(transaction.shiftId).toBe('shift-1');
    expect(transaction.userId).toBe(user.id);
    expect(transaction.customerId).toBeNull();
    expect(transaction.subtotal).toBe(12_000);
    expect(transaction.discount).toBe(0);
    expect(transaction.tax).toBe(0);
    expect(transaction.total).toBe(12_000);
    expect(transaction.status).toBe('paid');
    expect(transaction.createdAt).toBe(now());
    expect(transaction._getRaw('deleted')).toBe(false);

    const items = await db.get<TransactionItem>('transaction_items').query().fetch();
    expect(items).toHaveLength(1);
    expect(items[0].transactionId).toBe(transaction.id);
    expect(items[0].productId).toBe(product.id);
    expect(items[0].productNameSnapshot).toBe('Teh Pucuk 350ml');
    expect(items[0].unitSnapshot).toBe('pcs');
    expect(items[0].qty).toBe(3);
    expect(items[0].unitPrice).toBe(4_000);
    expect(items[0].discount).toBe(0);
    expect(items[0].total).toBe(12_000);

    const payments = await db.get<Payment>('payments').query().fetch();
    expect(payments).toHaveLength(1);
    expect(payments[0].method).toBe('cash');
    expect(payments[0].amount).toBe(12_000);
    expect(payments[0].reference).toBeNull();

    const movements = await db.get<StockMovement>('stock_movements').query().fetch();
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('sale');
    expect(movements[0].qty).toBe(-3);
    expect(movements[0].stockBefore).toBe(20);
    expect(movements[0].stockAfter).toBe(17);
    expect(movements[0].refType).toBe('transaction');
    expect(movements[0].refId).toBe('INV-20260827-0001');

    expect(product.stock).toBe(17);
  });

  it('snapshot nama & unit tetap tersimpan (tidak join ke products)', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, {
      stock: 10,
      name: 'Beras Pandan Wangi 5kg',
      unit: 'custom',
      customUnitLabel: 'karung',
      sellPrice: 75_000,
    });
    const user = await createUser(db);

    const result = await service.checkout(
      makeBaseInput(
        user.id,
        [{ productId: product.id, qty: 1, unitPrice: 75_000, discount: 0 }],
        [{ method: 'cash', amount: 75_000 }],
      ),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const item = (await db.get<TransactionItem>('transaction_items').query().fetch())[0];
    expect(item.productNameSnapshot).toBe('Beras Pandan Wangi 5kg');
    expect(item.unitSnapshot).toBe('karung');

    // Ubah nama produk setelah transaksi: snapshot tidak ikut berubah.
    await db.write(async () => {
      await product.update(raw => {
        raw.name = 'Beras Pandan Wangi 10kg';
      });
    });

    const still = (await db.get<TransactionItem>('transaction_items').query().fetch())[0];
    expect(still.productNameSnapshot).toBe('Beras Pandan Wangi 5kg');
  });

  it('invoice berurutan unik per hari: 0001 lalu 0002', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 100, sellPrice: 5_000 });
    const user = await createUser(db);

    const first = await service.checkout(
      makeBaseInput(
        user.id,
        [{ productId: product.id, qty: 1, unitPrice: 5_000, discount: 0 }],
        [{ method: 'cash', amount: 5_000 }],
      ),
    );
    const second = await service.checkout(
      makeBaseInput(
        user.id,
        [{ productId: product.id, qty: 2, unitPrice: 5_000, discount: 0 }],
        [{ method: 'cash', amount: 10_000 }],
      ),
    );

    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    if (first.status !== 'ok' || second.status !== 'ok') return;
    expect(first.invoiceNo).toBe('INV-20260827-0001');
    expect(second.invoiceNo).toBe('INV-20260827-0002');

    const rows = await db.get<Transaction>('transactions').query().fetch();
    expect(rows).toHaveLength(2);
  });

  it('split payment (2 metode) dengan sum = total tersimpan', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 10, sellPrice: 8_000 });
    const user = await createUser(db);

    const result = await service.checkout(
      makeBaseInput(
        user.id,
        [{ productId: product.id, qty: 1, unitPrice: 8_000, discount: 0 }],
        [
          { method: 'cash', amount: 5_000 },
          { method: 'qris', amount: 3_000, reference: 'QR-9988' },
        ],
      ),
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const payments = await db.get<Payment>('payments').query().fetch();
    expect(payments).toHaveLength(2);
    const byMethod = payments.map(p => [p.method, p.amount]).sort();
    expect(byMethod).toEqual([
      ['cash', 5_000],
      ['qris', 3_000],
    ]);
    expect(payments.find(p => p.method === 'qris')?.reference).toBe('QR-9988');
  });

  it('atomic: gagal di item ke-2 (stok kurang) tidak menulis apa pun', async () => {
    const { db, service } = makeHarness();
    const productA = await createProduct(db, { stock: 10, name: 'Indomie Goreng' });
    const productB = await createProduct(db, { stock: 2, name: 'Chitato' });
    const user = await createUser(db);

    const result = await service.checkout(
      makeBaseInput(
        user.id,
        [
          { productId: productA.id, qty: 3, unitPrice: 3_500, discount: 0 },
          { productId: productB.id, qty: 5, unitPrice: 9_500, discount: 0 },
        ],
        [{ method: 'cash', amount: 58_000 }],
      ),
    );

    expect(result).toEqual({
      status: 'insufficient_stock',
      productId: productB.id,
      stock: 2,
      requested: 5,
    });

    expect(await count(db, 'transactions')).toBe(0);
    expect(await count(db, 'transaction_items')).toBe(0);
    expect(await count(db, 'payments')).toBe(0);
    expect(await count(db, 'stock_movements')).toBe(0);
    expect(productA.stock).toBe(10);
    expect(productB.stock).toBe(2);
  });

  it('atomic: product_not_found membatalkan seluruh keranjang', async () => {
    const { db, service } = makeHarness();
    const productA = await createProduct(db, { stock: 10 });
    const user = await createUser(db);

    const result = await service.checkout(
      makeBaseInput(
        user.id,
        [
          { productId: productA.id, qty: 1, unitPrice: 3_500, discount: 0 },
          { productId: 'tidak-ada', qty: 1, unitPrice: 3_500, discount: 0 },
        ],
        [{ method: 'cash', amount: 7_000 }],
      ),
    );

    expect(result).toEqual({ status: 'product_not_found', productId: 'tidak-ada' });
    expect(await count(db, 'transactions')).toBe(0);
    expect(await count(db, 'stock_movements')).toBe(0);
    expect(productA.stock).toBe(10);
  });

  it('status debt mewajibkan customer dan menulis status debt', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 5, sellPrice: 20_000 });
    const user = await createUser(db);

    const missingCustomer = await service.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      items: [{ productId: product.id, qty: 1, unitPrice: 20_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [],
      status: 'debt',
    });
    expect(missingCustomer).toEqual({ status: 'customer_required' });

    const result = await service.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      customerId: 'cust-1',
      items: [{ productId: product.id, qty: 1, unitPrice: 20_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [],
      status: 'debt',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.transaction.status).toBe('debt');
    expect(result.transaction.customerId).toBe('cust-1');
    expect(await count(db, 'payments')).toBe(0);
  });

  it('payment_total_mismatch untuk paid bila sum != total', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 10, sellPrice: 10_000 });
    const user = await createUser(db);

    const result = await service.checkout(
      makeBaseInput(
        user.id,
        [{ productId: product.id, qty: 1, unitPrice: 10_000, discount: 0 }],
        [{ method: 'cash', amount: 9_000 }],
      ),
    );

    expect(result).toEqual({
      status: 'payment_total_mismatch',
      expected: 10_000,
      actual: 9_000,
    });
    expect(await count(db, 'transactions')).toBe(0);
  });

  it('validasi input: cart kosong, qty, diskon, user tidak ada', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 10 });
    const user = await createUser(db);

    expect(await service.checkout(makeBaseInput(user.id, [], []))).toEqual({
      status: 'empty_cart',
    });

    expect(
      await service.checkout(
        makeBaseInput(
          user.id,
          [{ productId: product.id, qty: 0, unitPrice: 3_500, discount: 0 }],
          [{ method: 'cash', amount: 0 }],
        ),
      ),
    ).toMatchObject({ status: 'invalid_item', index: 0, code: 'invalid_qty' });

    expect(
      await service.checkout(
        makeBaseInput(
          user.id,
          [{ productId: product.id, qty: 2, unitPrice: 3_500, discount: 9_999 }],
          [{ method: 'cash', amount: 1 }],
        ),
      ),
    ).toMatchObject({ status: 'invalid_item', index: 0, code: 'invalid_discount' });

    expect(
      await service.checkout(
        makeBaseInput(
          'user-hantu',
          [{ productId: product.id, qty: 1, unitPrice: 3_500, discount: 0 }],
          [{ method: 'cash', amount: 3_500 }],
        ),
      ),
    ).toEqual({ status: 'user_not_found', userId: 'user-hantu' });

    expect(await count(db, 'transactions')).toBe(0);
  });

  it('transaksi void tidak bisa dibuat lewat checkout', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db);
    const user = await createUser(db);

    const result = await service.checkout({
      ...makeBaseInput(
        user.id,
        [{ productId: product.id, qty: 1, unitPrice: 3_500, discount: 0 }],
        [{ method: 'cash', amount: 3_500 }],
      ),
      status: 'void' as unknown as 'paid',
    });

    expect(result).toEqual({ status: 'invalid_status', value: 'void' });
  });

  // T1.10 — Split payment edge cases
  it('split payment > 3 metode ditolak', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 10, sellPrice: 20_000 });
    const user = await createUser(db);

    const result = await service.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      items: [{ productId: product.id, qty: 1, unitPrice: 20_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [
        { method: 'cash', amount: 5_000 },
        { method: 'qris', amount: 5_000 },
        { method: 'debit', amount: 5_000 },
        { method: 'transfer', amount: 5_000 },
      ],
      status: 'paid',
    });

    expect(result).toEqual({
      status: 'invalid_payment',
      index: 3,
      code: 'too_many_methods',
    });
    expect(await count(db, 'transactions')).toBe(0);
  });

  it('split payment sum > total ditolak', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 10, sellPrice: 10_000 });
    const user = await createUser(db);

    const result = await service.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      items: [{ productId: product.id, qty: 1, unitPrice: 10_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [
        { method: 'cash', amount: 6_000 },
        { method: 'qris', amount: 6_000 },
      ],
      status: 'paid',
    });

    expect(result).toEqual({
      status: 'payment_total_mismatch',
      expected: 10_000,
      actual: 12_000,
    });
    expect(await count(db, 'transactions')).toBe(0);
  });

  it('split payment sum < total ditolak untuk status paid', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 10, sellPrice: 10_000 });
    const user = await createUser(db);

    const result = await service.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      items: [{ productId: product.id, qty: 1, unitPrice: 10_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [
        { method: 'cash', amount: 4_000 },
        { method: 'qris', amount: 4_000 },
      ],
      status: 'paid',
    });

    expect(result).toEqual({
      status: 'payment_total_mismatch',
      expected: 10_000,
      actual: 8_000,
    });
    expect(await count(db, 'transactions')).toBe(0);
  });

  it('bon status mewajibkan customer', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 5, sellPrice: 20_000 });
    const user = await createUser(db);

    const missingCustomer = await service.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      items: [{ productId: product.id, qty: 1, unitPrice: 20_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [],
      status: 'debt',
    });
    expect(missingCustomer).toEqual({ status: 'customer_required' });
  });

  it('bon status dengan customer menulis transaksi debt', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 5, sellPrice: 20_000 });
    const user = await createUser(db);

    const result = await service.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      customerId: 'cust-1',
      items: [{ productId: product.id, qty: 1, unitPrice: 20_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [],
      status: 'debt',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.transaction.status).toBe('debt');
    expect(result.transaction.customerId).toBe('cust-1');
    expect(await count(db, 'payments')).toBe(0);
  });

  it('bon status dengan partial payment (paymentsTotal <= total) diperbolehkan', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 5, sellPrice: 20_000 });
    const user = await createUser(db);

    const result = await service.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      customerId: 'cust-1',
      items: [{ productId: product.id, qty: 1, unitPrice: 20_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [{ method: 'cash', amount: 5_000 }],
      status: 'debt',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.transaction.status).toBe('debt');
    expect(result.transaction.customerId).toBe('cust-1');
    const payments = await db.get<Payment>('payments').query().fetch();
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(5_000);
  });

  it('bon status menolak paymentsTotal > total', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 5, sellPrice: 20_000 });
    const user = await createUser(db);

    const result = await service.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      customerId: 'cust-1',
      items: [{ productId: product.id, qty: 1, unitPrice: 20_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [{ method: 'cash', amount: 25_000 }],
      status: 'debt',
    });
    expect(result).toEqual({
      status: 'payment_total_mismatch',
      expected: 20_000,
      actual: 25_000,
    });
    expect(await count(db, 'transactions')).toBe(0);
  });

  it('defensif: duplikat invoice_no di dalam write melempar error dan rollback', async () => {
    const { db, service, now } = makeHarness();
    const product = await createProduct(db, { stock: 10, sellPrice: 5_000 });
    const user = await createUser(db);

    const duplicateInvoiceNo = 'INV-20260827-0001';
    await db.write(async () => {
      await db.get<Transaction>('transactions').create((raw) => {
        raw.invoiceNo = duplicateInvoiceNo;
        raw.shiftId = 'shift-1';
        raw.userId = user.id;
        raw.customerId = null;
        raw.subtotal = 5_000;
        raw.discount = 0;
        raw.tax = 0;
        raw.total = 5_000;
        raw.status = 'paid';
        raw.voidReason = null;
        raw.voidByUserId = null;
        raw.createdAt = now();
        raw.updatedAt = now();
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', now());
      });
    });

    const spy = jest
      .spyOn(service as unknown as { nextInvoiceNo: (ts: number) => Promise<string | null> }, 'nextInvoiceNo')
      .mockResolvedValue(duplicateInvoiceNo);

    await expect(
      service.checkout(
        makeBaseInput(
          user.id,
          [{ productId: product.id, qty: 1, unitPrice: 5_000, discount: 0 }],
          [{ method: 'cash', amount: 5_000 }],
        ),
      ),
    ).rejects.toThrow(`duplikat invoice_no terdeteksi: ${duplicateInvoiceNo}`);

    spy.mockRestore();

    // LokiJSAdapter in-memory tidak me-rollback baris yang sudah ter-create sebelum throw,
    // sehingga transaksi duplikat tetap terhitung (di SQLite produksi, write me-rollback).
    // Yang penting: error terlihat (bukan silent overwrite) dan efek samping lain tidak tertulis.
    expect(await count(db, 'transactions')).toBe(2);
    expect(await count(db, 'transaction_items')).toBe(0);
    expect(await count(db, 'payments')).toBe(0);
    expect(await count(db, 'stock_movements')).toBe(0);
    expect(product.stock).toBe(10);
  });
});
