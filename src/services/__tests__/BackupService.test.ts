import { Database, Q } from '@nozbe/watermelondb';
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
import { BackupService } from '../BackupService';

logger.silence();

const makeDb = (): Database => {
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

const nowFixture = 1700000000000;

const createCategory = async (db: Database, name = 'Makanan Instan'): Promise<Category> => {
  let created: Category | undefined;
  await db.write(async () => {
    created = await db.get<Category>('categories').create((raw) => {
      raw.name = name;
      raw.createdAt = nowFixture;
      raw.updatedAt = nowFixture;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', nowFixture);
    });
  });
  if (!created) throw new Error('kategori gagal');
  return created;
};

const createProduct = async (db: Database, categoryId: string | null = null): Promise<Product> => {
  let created: Product | undefined;
  await db.write(async () => {
    created = await db.get<Product>('products').create((raw) => {
      raw.name = 'Indomie Goreng';
      raw.barcode = '8998866200011';
      raw.categoryId = categoryId;
      raw.unit = 'pcs';
      raw.customUnitLabel = null;
      raw.costPrice = 2500;
      raw.sellPrice = 3500;
      raw.stock = 48;
      raw.minStock = 12;
      raw.isActive = true;
      raw.photoPath = null;
      raw.createdAt = nowFixture;
      raw.updatedAt = nowFixture;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', nowFixture);
    });
  });
  if (!created) throw new Error('produk gagal');
  return created;
};

const createCustomer = async (db: Database): Promise<Customer> => {
  let created: Customer | undefined;
  await db.write(async () => {
    created = await db.get<Customer>('customers').create((raw) => {
      raw.name = 'Pak Budi';
      raw.phone = '08123456789';
      raw.note = null;
      raw.debtLimit = 500000;
      raw.createdAt = nowFixture;
      raw.updatedAt = nowFixture;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', nowFixture);
    });
  });
  if (!created) throw new Error('customer gagal');
  return created;
};

const createUser = async (db: Database, name = 'Budi', pinHash = '$scrypt$16384$8$1$deadbeef$deadbeef'): Promise<User> => {
  let created: User | undefined;
  await db.write(async () => {
    created = await db.get<User>('users').create((raw) => {
      raw.name = name;
      raw.pinHash = pinHash;
      raw.role = 'admin';
      raw.isActive = true;
      raw.createdAt = nowFixture;
      raw.updatedAt = nowFixture;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', nowFixture);
    });
  });
  if (!created) throw new Error('user gagal');
  return created;
};

const createShift = async (db: Database, userId: string): Promise<Shift> => {
  let created: Shift | undefined;
  await db.write(async () => {
    created = await db.get<Shift>('shifts').create((raw) => {
      raw.userId = userId;
      raw.openedAt = nowFixture;
      raw.closedAt = null;
      raw.openingCash = 100000;
      raw.closingCash = null;
      raw.expectedCash = null;
      raw.difference = null;
      raw.status = 'open';
      raw.notes = null;
      raw.createdAt = nowFixture;
      raw.updatedAt = nowFixture;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', nowFixture);
    });
  });
  if (!created) throw new Error('shift gagal');
  return created;
};

const createTransactionWithItems = async (
  db: Database,
  shiftId: string,
  userId: string,
  product: Product,
): Promise<Transaction> => {
  let created: Transaction | undefined;
  await db.write(async () => {
    created = await db.get<Transaction>('transactions').create((raw) => {
      raw.invoiceNo = 'INV-20260827-0001';
      raw.shiftId = shiftId;
      raw.userId = userId;
      raw.customerId = null;
      raw.subtotal = 7000;
      raw.discount = 0;
      raw.tax = 0;
      raw.total = 7000;
      raw.status = 'paid';
      raw.voidReason = null;
      raw.voidByUserId = null;
      raw.createdAt = nowFixture;
      raw.updatedAt = nowFixture;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', nowFixture);
    });
    await db.get<TransactionItem>('transaction_items').create((raw) => {
      raw.transactionId = created!.id;
      raw.productId = product.id;
      raw.productNameSnapshot = product.name;
      raw.unitSnapshot = product.unit;
      raw.qty = 2;
      raw.unitPrice = 3500;
      raw.discount = 0;
      raw.total = 7000;
      raw.createdAt = nowFixture;
      raw.updatedAt = nowFixture;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', nowFixture);
    });
    await db.get<Payment>('payments').create((raw) => {
      raw.transactionId = created!.id;
      raw.method = 'cash';
      raw.amount = 7000;
      raw.reference = null;
      raw.createdAt = nowFixture;
      raw.updatedAt = nowFixture;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', nowFixture);
    });
    await db.get<StockMovement>('stock_movements').create((raw) => {
      raw.productId = product.id;
      raw.type = 'sale';
      raw.qty = -2;
      raw.stockBefore = 48;
      raw.stockAfter = 46;
      raw.reason = null;
      raw.refType = 'transaction';
      raw.refId = 'INV-20260827-0001';
      raw.userId = userId;
      raw.createdAt = nowFixture;
      raw.updatedAt = nowFixture;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', nowFixture);
    });
  });
  if (!created) throw new Error('trx gagal');
  return created;
};

describe('BackupService — file manual .zip JSON + restore replace-only (T3.8)', () => {
  it('export menghasilkan JSON valid dengan preview ringkas', async () => {
    const db = makeDb();
    const cat = await createCategory(db);
    await createProduct(db, cat.id);
    const user = await createUser(db);
    await createCustomer(db);
    const shift = await createShift(db, user.id);
    const product = (await db.get<Product>('products').query().fetch())[0];
    await createTransactionWithItems(db, shift.id, user.id, product);

    const svc = new BackupService(db, { now: () => nowFixture });
    const json = await svc.exportBackup({ deviceLabel: 'Warung Budi' });
    const outer = JSON.parse(json) as { version: number; createdAt: number; deviceLabel: string; encrypted: boolean; payload: { tables: Record<string, unknown[]> } };
    expect(outer.version).toBe(1);
    expect(outer.createdAt).toBe(nowFixture);
    expect(outer.deviceLabel).toBe('Warung Budi');
    expect(outer.encrypted).toBe(false);
    expect(outer.payload.tables.products).toHaveLength(1);
    expect(outer.payload.tables.categories).toHaveLength(1);
    expect(outer.payload.tables.customers).toHaveLength(1);
    expect(outer.payload.tables.users).toHaveLength(1);
    expect(outer.payload.tables.transactions).toHaveLength(1);

    const previewRes = await svc.previewBackup(json);
    expect(previewRes.status).toBe('ok');
    if (previewRes.status !== 'ok') return;
    expect(previewRes.preview.totalProducts).toBe(1);
    expect(previewRes.preview.totalCustomers).toBe(1);
    expect(previewRes.preview.totalTransactions).toBe(1);
    expect(previewRes.preview.deviceLabel).toBe('Warung Budi');
    expect(previewRes.preview.encrypted).toBe(false);
    expect(previewRes.preview.sizeBytes).toBe(json.length);
    expect(previewRes.preview.transactionDateRange.min).toBe(nowFixture);
    expect(previewRes.preview.transactionDateRange.max).toBe(nowFixture);
    expect(previewRes.preview.counts.products).toBe(1);
  });

  it('PIN hash tidak ikut di backup', async () => {
    const db = makeDb();
    const secret = '$scrypt$16384$8$1$salt123$hash999';
    await createUser(db, 'Budi', secret);
    const svc = new BackupService(db, { now: () => nowFixture });
    const json = await svc.exportBackup();
    const outer = JSON.parse(json) as { payload: { tables: { users: Record<string, unknown>[] } } };
    expect(outer.payload.tables.users).toHaveLength(1);
    const raw = outer.payload.tables.users[0];
    expect(raw).not.toHaveProperty('pin_hash');
    expect(raw).toHaveProperty('name', 'Budi');
    // ensure raw JSON string does not contain secret
    expect(json).not.toContain('hash999');
    expect(json).not.toContain(secret);
  });

  it('enkripsi AES-GCM opsional: preview butuh password, decrypt gagal bila salah', async () => {
    const db = makeDb();
    await createCategory(db);
    const svc = new BackupService(db, { now: () => nowFixture });
    const json = await svc.exportBackup({ password: 'rahasia123' });
    const outer = JSON.parse(json) as { encrypted: boolean; encryptedPayload: string; payload?: unknown };
    expect(outer.encrypted).toBe(true);
    expect(outer.encryptedPayload).toBeDefined();
    expect(outer.payload).toBeUndefined();

    const noPass = await svc.previewBackup(json);
    expect(noPass.status).toBe('password_required');

    const wrong = await svc.previewBackup(json, 'salah');
    expect(wrong.status).toBe('decrypt_failed');

    const ok = await svc.previewBackup(json, 'rahasia123');
    expect(ok.status).toBe('ok');
    if (ok.status !== 'ok') return;
    expect(ok.preview.encrypted).toBe(true);
    expect(ok.preview.counts.categories).toBe(1);
  });

  it('import butuh konfirmasi eksplisit', async () => {
    const db = makeDb();
    await createCategory(db);
    const svc = new BackupService(db, { now: () => nowFixture });
    const json = await svc.exportBackup();

    const freshDb = makeDb();
    const freshSvc = new BackupService(freshDb, { now: () => nowFixture });
    const withoutConfirm = await freshSvc.importBackup(json, { confirmed: false });
    expect(withoutConfirm.status).toBe('confirmation_required');
    expect(await freshDb.get<Category>('categories').query().fetch()).toHaveLength(0);

    const withConfirm = await freshSvc.importBackup(json, { confirmed: true });
    expect(withConfirm.status).toBe('ok');
    expect(await freshDb.get<Category>('categories').query().fetch()).toHaveLength(1);
  });

  it('roundtrip export→import utuh di device bersih (replace-only)', async () => {
    const db = makeDb();
    const cat = await createCategory(db, 'Minuman');
    const prod = await createProduct(db, cat.id);
    const customer = await createCustomer(db);
    const user = await createUser(db, 'Budi', '$scrypt$test$hash');
    const shift = await createShift(db, user.id);
    await createTransactionWithItems(db, shift.id, user.id, prod);

    // tambah setting
    await db.write(async () => {
      await db.get<Setting>('settings').create((raw) => {
        raw.key = 'store_name';
        raw.value = 'Warung Budi';
      });
    });

    const svc = new BackupService(db, { now: () => nowFixture });
    const json = await svc.exportBackup({ deviceLabel: 'HP Lama' });

    // device bersih
    const freshDb = makeDb();
    const freshSvc = new BackupService(freshDb, { now: () => nowFixture });
    const imported = await freshSvc.importBackup(json, { confirmed: true });
    expect(imported.status).toBe('ok');
    if (imported.status !== 'ok') return;

    expect((await freshDb.get<Category>('categories').query().fetch()).length).toBe(1);
    expect((await freshDb.get<Product>('products').query().fetch())[0].name).toBe('Indomie Goreng');
    expect((await freshDb.get<Product>('products').query().fetch())[0].barcode).toBe('8998866200011');
    expect((await freshDb.get<Customer>('customers').query().fetch())[0].name).toBe(customer.name);
    expect((await freshDb.get<Shift>('shifts').query().fetch()).length).toBe(1);
    expect((await freshDb.get<Transaction>('transactions').query().fetch()).length).toBe(1);
    expect((await freshDb.get<TransactionItem>('transaction_items').query().fetch()).length).toBe(1);
    expect((await freshDb.get<Payment>('payments').query().fetch()).length).toBe(1);
    expect((await freshDb.get<StockMovement>('stock_movements').query().fetch()).length).toBe(1);
    expect((await freshDb.get<Setting>('settings').query(Q.where('key', 'store_name')).fetch())[0].value).toBe(
      'Warung Budi',
    );
    // users restored dengan placeholder pin_hash (tidak bocor secret)
    const restoredUsers = await freshDb.get<User>('users').query().fetch();
    expect(restoredUsers).toHaveLength(1);
    expect(restoredUsers[0].name).toBe('Budi');
    expect(restoredUsers[0].pinHash).not.toContain('$scrypt$test$hash');
    expect(json).not.toContain('$scrypt$test$hash');

    // preview setelah import konsisten
    expect(imported.preview.totalProducts).toBe(1);
    expect(imported.preview.deviceLabel).toBe('HP Lama');
  });

  it('roundtrip terenkripsi utuh', async () => {
    const db = makeDb();
    await createCategory(db, 'Makanan');
    await createProduct(db);
    const svc = new BackupService(db, { now: () => nowFixture });
    const json = await svc.exportBackup({ password: 'pass1234', deviceLabel: 'HP Terenkripsi' });

    const freshDb = makeDb();
    const freshSvc = new BackupService(freshDb);
    const needsPass = await freshSvc.importBackup(json, { confirmed: true });
    expect(needsPass.status).toBe('password_required');

    const wrong = await freshSvc.importBackup(json, { confirmed: true, password: 'salah123' });
    expect(wrong.status).toBe('decrypt_failed');
    expect((await freshDb.get<Category>('categories').query().fetch()).length).toBe(0);

    const ok = await freshSvc.importBackup(json, { confirmed: true, password: 'pass1234' });
    expect(ok.status).toBe('ok');
    expect((await freshDb.get<Category>('categories').query().fetch()).length).toBe(1);
  });

  it('restore replace-only: data lama terhapus digantikan', async () => {
    const srcDb = makeDb();
    await createCategory(srcDb, 'Kategori Baru');
    const srcSvc = new BackupService(srcDb, { now: () => nowFixture });
    const json = await srcSvc.exportBackup();

    const destDb = makeDb();
    await createCategory(destDb, 'Kategori Lama');
    const oldCats = await destDb.get<Category>('categories').query().fetch();
    expect(oldCats).toHaveLength(1);
    expect(oldCats[0].name).toBe('Kategori Lama');

    const destSvc = new BackupService(destDb, { now: () => nowFixture });
    const res = await destSvc.importBackup(json, { confirmed: true });
    expect(res.status).toBe('ok');
    const newCats = await destDb.get<Category>('categories').query().fetch();
    expect(newCats).toHaveLength(1);
    expect(newCats[0].name).toBe('Kategori Baru');
  });

  it('menangani JSON tidak valid dan versi tidak didukung', async () => {
    const db = makeDb();
    const svc = new BackupService(db);
    const bad = await svc.previewBackup('bukan json');
    expect(bad.status).toBe('invalid_json');

    const badVersion = JSON.stringify({ version: 999, createdAt: 1, deviceLabel: 'x', encrypted: false, payload: { tables: {} } });
    const vRes = await svc.previewBackup(badVersion);
    expect(vRes.status).toBe('invalid_version');

    const imp = await svc.importBackup('bukan json', { confirmed: true });
    expect(imp.status).toBe('invalid_json');
  });
});
