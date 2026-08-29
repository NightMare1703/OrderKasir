import { Database, Q } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';

import Category from '../../database/models/category';
import Customer from '../../database/models/customer';
import Payment from '../../database/models/payment';
import Product from '../../database/models/product';
import Setting from '../../database/models/setting';
import StockMovement from '../../database/models/stock-movement';
import Transaction from '../../database/models/transaction';
import TransactionItem from '../../database/models/transaction-item';
import User from '../../database/models/user';
import { appDatabaseSchema } from '../../database/schema';
import { CheckoutService } from '../CheckoutService';
import { TransactionService } from '../TransactionService';

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
    modelClasses: [Category, Customer, Payment, Product, Setting, StockMovement, Transaction, TransactionItem, User],
  });
};

const FIXED_NOW = new Date(2026, 8, 10, 10, 0, 0).getTime();

const makeFakeHasher = () => ({
  verify: async (pin: string, hash: string) => hash === `plain$${pin}`,
});

const createProduct = async (db: Database, overrides: Partial<{ stock: number; name: string }> = {}): Promise<Product> => {
  const { stock = 20, name = 'Indomie Goreng' } = overrides;
  let created: Product | undefined;
  await db.write(async () => {
    created = await db.get<Product>('products').create((raw) => {
      raw.name = name;
      raw.barcode = null;
      raw.categoryId = null;
      raw.unit = 'pcs';
      raw.customUnitLabel = null;
      raw.costPrice = 2500;
      raw.sellPrice = 3500;
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

const createUser = async (
  db: Database,
  overrides: Partial<{ name: string; pin: string; role: 'admin' | 'kasir'; isActive: boolean }> = {},
): Promise<User> => {
  const { name = 'Budi', pin = '1234', role = 'admin', isActive = true } = overrides;
  let created: User | undefined;
  await db.write(async () => {
    created = await db.get<User>('users').create((raw) => {
      raw.name = name;
      raw.pinHash = `plain$${pin}`;
      raw.role = role;
      raw.isActive = isActive;
      raw.createdAt = 1;
      raw.updatedAt = 1;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', 1);
    });
  });
  if (!created) throw new Error('gagal membuat user uji');
  return created;
};

const createTransactionViaCheckout = async (db: Database, product: Product, user: User, now: number) => {
  const svc = new CheckoutService(db, { now: () => now });
  const result = await svc.checkout({
    shiftId: 'shift-1',
    userId: user.id,
    items: [{ productId: product.id, qty: 3, unitPrice: 3500, discount: 0 }],
    transactionDiscount: 0,
    tax: 0,
    payments: [{ method: 'cash', amount: 10500 }],
    status: 'paid',
  });
  if (result.status !== 'ok') throw new Error(`checkout gagal: ${result.status}`);
  return result.transaction;
};

describe('TransactionService - list & detail (T1.12)', () => {
  it('list mengembalikan transaksi terbaru dulu dan filter berjalan', async () => {
    const db = makeDb();
    const hasher = makeFakeHasher();
    const svc = new TransactionService(db, { now: () => FIXED_NOW, hasher });

    const product = await createProduct(db, { stock: 100 });
    const kasir = await createUser(db, { name: 'Sari', role: 'kasir', pin: '1111' });
    const admin = await createUser(db, { name: 'Budi', role: 'admin', pin: '1234' });

    const t1 = await createTransactionViaCheckout(db, product, kasir, FIXED_NOW);
    const t2 = await createTransactionViaCheckout(db, product, admin, FIXED_NOW + 1000);
    await db.write(async () => {
      await t2.update((r) => {
        r.createdAt = FIXED_NOW + 1000;
        r.updatedAt = FIXED_NOW + 1000;
      });
    });

    // Buat transaksi qris terpisah dengan metode qris
    const checkout = new CheckoutService(db, { now: () => FIXED_NOW + 2000 });
    const qrisResult = await checkout.checkout({
      shiftId: 'shift-1',
      userId: kasir.id,
      items: [{ productId: product.id, qty: 1, unitPrice: 3500, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [{ method: 'qris', amount: 3500 }],
      status: 'paid',
    });
    expect(qrisResult.status).toBe('ok');

    const all = await svc.list();
    expect(all.length).toBe(3);
    expect(all[0].createdAt).toBeGreaterThanOrEqual(all[1].createdAt);

    const byKasir = await svc.list({ userId: kasir.id });
    expect(byKasir.every((t) => t.userId === kasir.id)).toBe(true);

    const byQris = await svc.list({ method: 'qris' });
    expect(byQris.length).toBe(1);
    expect(byQris[0].id).toBe((qrisResult as { transaction: Transaction }).transaction.id);

    const byDate = await svc.list({ dateFrom: FIXED_NOW + 1500 });
    expect(byDate.length).toBe(1);

    // detail immutable snapshot
    const detail = await svc.getDetail(t1.id);
    expect(detail).not.toBeNull();
    if (!detail) return;
    expect(detail.items[0].productNameSnapshot).toBe('Indomie Goreng');
    expect(detail.payments[0].method).toBe('cash');
    expect(detail.transaction.invoiceNo).toMatch(/^INV-/);

    // ubah produk setelah transaksi, snapshot tetap
    await db.write(async () => {
      await product.update((r) => {
        r.name = 'Indomie Baru';
      });
    });
    const still = await svc.getDetail(t1.id);
    expect(still!.items[0].productNameSnapshot).toBe('Indomie Goreng');
  });

  it('getDetail null untuk id tidak ada atau deleted', async () => {
    const db = makeDb();
    const svc = new TransactionService(db, { hasher: makeFakeHasher() });
    const product = await createProduct(db, { stock: 20 });
    const user = await createUser(db, { role: 'kasir', pin: '0000' });
    const t = await createTransactionViaCheckout(db, product, user, FIXED_NOW);
    expect(await svc.getDetail('tidak-ada')).toBeNull();
    expect(await svc.getDetail(t.id)).not.toBeNull();
    // soft delete
    await db.write(async () => {
      await t.update((r) => r._setRaw('deleted', true));
    });
    expect(await svc.getDetail(t.id)).toBeNull();
  });
});

describe('TransactionService - void flow (T1.12)', () => {
  it('void sukses: status jadi void, stok kembali, movement void tertulis atomik', async () => {
    const db = makeDb();
    let currentTime = FIXED_NOW;
    const hasher = makeFakeHasher();
    const svc = new TransactionService(db, { now: () => currentTime, hasher });

    const product = await createProduct(db, { stock: 20 });
    const kasir = await createUser(db, { name: 'Sari', role: 'kasir', pin: '0000' });
    const admin = await createUser(db, { name: 'Budi', role: 'admin', pin: '9999' });

    const transaction = await createTransactionViaCheckout(db, product, kasir, currentTime);
    expect(product.stock).toBe(17);

    currentTime = FIXED_NOW + 5000;
    const result = await svc.voidTransaction({
      transactionId: transaction.id,
      reason: 'Salah input harga',
      adminUserId: admin.id,
      adminPin: '9999',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.transaction.status).toBe('void');
    expect(result.transaction.voidReason).toBe('Salah input harga');
    expect(result.transaction.voidByUserId).toBe(admin.id);
    expect(result.transaction.updatedAt).toBe(currentTime);

    // stok kembali 20
    expect(product.stock).toBe(20);

    const movements = await db.get<StockMovement>('stock_movements').query().fetch();
    expect(movements.length).toBe(2);
    const voidMovement = movements.find((m) => m.type === 'void');
    expect(voidMovement).toBeDefined();
    expect(voidMovement!.qty).toBe(3);
    expect(voidMovement!.stockBefore).toBe(17);
    expect(voidMovement!.stockAfter).toBe(20);
    expect(voidMovement!.reason).toBe('Salah input harga');
    expect(voidMovement!.refType).toBe('transaction');
    expect(voidMovement!.refId).toBe(transaction.invoiceNo);
    expect(voidMovement!.userId).toBe(admin.id);
  });

  it('void gagal: alasan kosong, sudah void, pin salah, bukan admin, nonaktif', async () => {
    const db = makeDb();
    const hasher = makeFakeHasher();
    const svc = new TransactionService(db, { now: () => FIXED_NOW, hasher });

    const product = await createProduct(db, { stock: 30 });
    const kasir = await createUser(db, { name: 'Sari', role: 'kasir', pin: '0000' });
    const admin = await createUser(db, { name: 'Budi', role: 'admin', pin: '1234' });
    const adminNonAktif = await createUser(db, { name: 'Nonaktif', role: 'admin', isActive: false, pin: '1111' });

    const transaction = await createTransactionViaCheckout(db, product, kasir, FIXED_NOW);
    expect(await svc.voidTransaction({ transactionId: transaction.id, reason: '   ', adminUserId: admin.id, adminPin: '1234' })).toEqual({
      status: 'reason_required',
    });

    expect(await svc.voidTransaction({ transactionId: transaction.id, reason: 'Salah', adminUserId: admin.id, adminPin: '0000' })).toEqual({
      status: 'invalid_pin',
    });

    expect(await svc.voidTransaction({ transactionId: transaction.id, reason: 'Salah', adminUserId: kasir.id, adminPin: '0000' })).toEqual({
      status: 'not_admin',
    });

    expect(await svc.voidTransaction({ transactionId: transaction.id, reason: 'Salah', adminUserId: adminNonAktif.id, adminPin: '1111' })).toEqual({
      status: 'admin_inactive',
    });

    expect(await svc.voidTransaction({ transactionId: transaction.id, reason: 'Salah', adminUserId: 'tidak-ada', adminPin: '1234' })).toEqual({
      status: 'admin_not_found',
      adminUserId: 'tidak-ada',
    });

    expect(await svc.voidTransaction({ transactionId: 'tidak-ada', reason: 'Salah', adminUserId: admin.id, adminPin: '1234' })).toEqual({
      status: 'not_found',
      transactionId: 'tidak-ada',
    });

    // void pertama sukses
    const ok = await svc.voidTransaction({ transactionId: transaction.id, reason: 'Salah', adminUserId: admin.id, adminPin: '1234' });
    expect(ok.status).toBe('ok');
    expect(product.stock).toBe(30);

    // kedua kali sudah void
    expect(await svc.voidTransaction({ transactionId: transaction.id, reason: 'Lagi', adminUserId: admin.id, adminPin: '1234' })).toEqual({
      status: 'already_void',
    });

    // stok tidak berubah setelah gagal kedua
    expect(product.stock).toBe(30);
    const movements = await db.get<StockMovement>('stock_movements').query().fetch();
    expect(movements.filter((m) => m.type === 'void').length).toBe(1);
  });

  it('void multi-item: agregasi qty per produk dan stok semua kembali', async () => {
    const db = makeDb();
    const hasher = makeFakeHasher();
    let currentTime = FIXED_NOW;
    const svc = new TransactionService(db, { now: () => currentTime, hasher });

    const productA = await createProduct(db, { stock: 50, name: 'A' });
    const productB = await createProduct(db, { stock: 10, name: 'B' });
    const admin = await createUser(db, { role: 'admin', pin: '1234' });
    const kasir = await createUser(db, { role: 'kasir', pin: '0000' });

    const checkout = new CheckoutService(db, { now: () => currentTime });
    const result = await checkout.checkout({
      shiftId: 'shift-1',
      userId: kasir.id,
      items: [
        { productId: productA.id, qty: 5, unitPrice: 3500, discount: 0 },
        { productId: productB.id, qty: 2, unitPrice: 5000, discount: 0 },
      ],
      transactionDiscount: 0,
      tax: 0,
      payments: [{ method: 'cash', amount: 27500 }],
      status: 'paid',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(productA.stock).toBe(45);
    expect(productB.stock).toBe(8);

    currentTime = FIXED_NOW + 7000;
    const voidResult = await svc.voidTransaction({
      transactionId: result.transaction.id,
      reason: 'Batal semua',
      adminUserId: admin.id,
      adminPin: '1234',
    });
    expect(voidResult.status).toBe('ok');
    expect(productA.stock).toBe(50);
    expect(productB.stock).toBe(10);

    const voids = (await db.get<StockMovement>('stock_movements').query(Q.where('type', 'void')).fetch()).sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    expect(voids.length).toBe(2);
  });

  it('filter status dan searchInvoice bekerja', async () => {
    const db = makeDb();
    const hasher = makeFakeHasher();
    const svc = new TransactionService(db, { now: () => FIXED_NOW, hasher });
    const product = await createProduct(db, { stock: 100 });
    const kasir = await createUser(db, { role: 'kasir', pin: '0000' });
    const admin = await createUser(db, { role: 'admin', pin: '1234' });

    const t = await createTransactionViaCheckout(db, product, kasir, FIXED_NOW);
    await svc.voidTransaction({ transactionId: t.id, reason: 'salah', adminUserId: admin.id, adminPin: '1234' });

    const voids = await svc.list({ status: 'void' });
    expect(voids.length).toBe(1);
    expect(voids[0].id).toBe(t.id);

    const paid = await svc.list({ status: 'paid' });
    expect(paid.length).toBe(0);

    const byInvoice = await svc.list({ searchInvoice: t.invoiceNo.slice(0, 8) });
    expect(byInvoice.length).toBe(1);
  });
});
