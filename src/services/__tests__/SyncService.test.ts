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
import { MockSyncAdapter } from '../../database/sync';
import { CheckoutService } from '../CheckoutService';
import { LAST_PULLED_AT_KEY, SyncService } from '../SyncService';

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

const createProduct = async (db: Database, overrides: Partial<{ name: string }> = {}): Promise<Product> => {
  let created: Product | undefined;
  await db.write(async () => {
    created = await db.get<Product>('products').create((raw) => {
      raw.name = overrides.name ?? 'Indomie Goreng';
      raw.barcode = null;
      raw.categoryId = null;
      raw.unit = 'pcs';
      raw.customUnitLabel = null;
      raw.costPrice = 2500;
      raw.sellPrice = 3500;
      raw.stock = 10;
      raw.minStock = 2;
      raw.isActive = true;
      raw.createdAt = 1;
      raw.updatedAt = 1;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', 1);
    });
  });
  if (!created) throw new Error('gagal membuat produk');
  return created;
};

const createUser = async (db: Database): Promise<User> => {
  let created: User | undefined;
  await db.write(async () => {
    created = await db.get<User>('users').create((raw) => {
      raw.name = 'Budi';
      raw.pinHash = 'hash';
      raw.role = 'admin';
      raw.isActive = true;
      raw.createdAt = 1;
      raw.updatedAt = 1;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', 1);
    });
  });
  if (!created) throw new Error('gagal membuat user');
  return created;
};

describe('SyncService — queue drain & adapter mock (T3.7)', () => {
  it('awal: status synced bila tidak ada perubahan, pending setelah write, synced lagi setelah synchronize', async () => {
    const db = makeDb();
    const adapter = new MockSyncAdapter();
    adapter.setTimestamp(5000);
    const service = new SyncService(db, adapter, { now: () => 5000, isOnline: () => true, debounceMs: 0 });

    const initialStatus = await service.getSyncStatus();
    expect(initialStatus.status).toBe('synced');
    expect(initialStatus.pendingCount).toBe(0);
    expect(initialStatus.lastPulledAt).toBe(0);
    expect(await service.hasUnsyncedChanges()).toBe(false);
    expect(await service.getPendingCount()).toBe(0);

    await createProduct(db, { name: 'Teh Pucuk 350ml' });

    expect(await service.hasUnsyncedChanges()).toBe(true);
    const pending = await service.getSyncStatus();
    expect(pending.status).toBe('pending');
    expect(pending.pendingCount).toBeGreaterThanOrEqual(1);

    const result = await service.synchronize();
    expect(result.status).toBe('ok');
    expect(adapter.pushHistory).toHaveLength(1);
    expect(adapter.pullHistory).toHaveLength(1);
    expect(adapter.pullHistory[0].lastPulledAt).toBe(0);

    const lastPulledAt = await service.getLastPulledAt();
    expect(lastPulledAt).toBe(5000);

    expect(await service.hasUnsyncedChanges()).toBe(false);
    expect(await service.getPendingCount()).toBe(0);
    const synced = await service.getSyncStatus();
    expect(synced.status).toBe('synced');
    expect(synced.lastPulledAt).toBe(5000);
  });

  it('drain batched: pushChanges membawa perubahan lokal (created) dan last_modified untuk last-write-wins', async () => {
    const db = makeDb();
    const adapter = new MockSyncAdapter();
    adapter.setTimestamp(9999);
    const now = 9999;
    const service = new SyncService(db, adapter, { now: () => now, isOnline: () => true });

    const product = await createProduct(db, { name: 'Beras Pandan Wangi 5kg' });

    const result = await service.synchronize();
    expect(result.status).toBe('ok');

    const pushed = adapter.pushHistory[0];
    expect(pushed).toBeDefined();
    // WatermelonDB synchronize pulls first then pushes with newLastPulledAt
    expect(pushed.lastPulledAt).toBe(9999);
    const productsChange = pushed.changes.products;
    expect(productsChange).toBeDefined();
    expect(productsChange.created.length).toBeGreaterThanOrEqual(1);
    const createdRaw = productsChange.created.find((r: Record<string, unknown>) => r.id === product.id) as unknown as Record<string, unknown>;
    expect(createdRaw).toBeDefined();
    expect(createdRaw.last_modified).toBe(1);

    // Simulasi last-write-wins: update lokal dengan last_modified lebih baru
    await db.write(async () => {
      await product.update((raw) => {
        raw.name = 'Beras Update Lokal';
        raw.updatedAt = 8000;
        raw._setRaw('last_modified', 8000);
      });
    });
    expect(await service.hasUnsyncedChanges()).toBe(true);

    adapter.setTimestamp(10000);
    const second = await service.synchronize();
    expect(second.status).toBe('ok');
    const secondPush = adapter.pushHistory[1];
    const updated = secondPush.changes.products?.updated ?? [];
    const found = updated.find((r: Record<string, unknown>) => r.id === product.id) as unknown as Record<string, unknown>;
    expect(found).toBeDefined();
    expect(found.last_modified).toBe(8000);
  });

  it('lastPulledAt disimpan di settings dan dipakai di pull berikutnya', async () => {
    const db = makeDb();
    const adapter = new MockSyncAdapter();
    adapter.setTimestamp(1000);
    const service = new SyncService(db, adapter, { now: () => 1000, isOnline: () => true });

    await createProduct(db);
    await service.synchronize();
    expect(await service.getLastPulledAt()).toBe(1000);

    adapter.setTimestamp(2000);
    adapter.setRemoteChanges({});
    await createProduct(db, { name: 'Produk Kedua' });
    await service.synchronize();
    expect(adapter.pullHistory[1].lastPulledAt).toBe(1000);
    expect(await service.getLastPulledAt()).toBe(2000);
  });

  it('pullChanges diterapkan ke DB lokal (remote created)', async () => {
    const db = makeDb();
    const adapter = new MockSyncAdapter();
    const now = Date.now();
    adapter.setTimestamp(now);
    adapter.setRemoteChanges({
      categories: {
        created: [{ id: 'cat-remote-1', name: 'Minuman', created_at: now, updated_at: now, last_modified: now, deleted: false }],
        updated: [],
        deleted: [],
      },
    } as unknown as Record<string, { created: Record<string, unknown>[]; updated: Record<string, unknown>[]; deleted: string[] }>);
    const service = new SyncService(db, adapter, { now: () => now, isOnline: () => true });

    const result = await service.synchronize();
    expect(result.status).toBe('ok');

    const cats = await db.get<Category>('categories').query().fetch();
    expect(cats.some((c) => c.id === 'cat-remote-1')).toBe(true);
  });

  it('offline: synchronize tidak memanggil adapter dan status header offline', async () => {
    const db = makeDb();
    const adapter = new MockSyncAdapter();
    const service = new SyncService(db, adapter, { isOnline: () => false });

    await createProduct(db);

    const statusBefore = await service.getSyncStatus();
    expect(statusBefore.status).toBe('offline');
    expect(statusBefore.pendingCount).toBeGreaterThanOrEqual(1);
    expect(statusBefore.isOnline).toBe(false);

    const result = await service.synchronize();
    expect(result.status).toBe('offline');
    expect(adapter.pushHistory).toHaveLength(0);
    expect(adapter.pullHistory).toHaveLength(0);

    expect(await service.hasUnsyncedChanges()).toBe(true);
  });

  it('online kembali: pending changes tetap ada dan bisa di-sync', async () => {
    const db = makeDb();
    const adapter = new MockSyncAdapter();
    let online = false;
    const service = new SyncService(db, adapter, { isOnline: () => online });

    await createProduct(db);
    expect(await service.synchronize()).toEqual({ status: 'offline' });
    expect(await service.getPendingCount()).toBeGreaterThanOrEqual(1);

    online = true;
    adapter.setTimestamp(1234);
    const result = await service.synchronize();
    expect(result.status).toBe('ok');
    expect(await service.hasUnsyncedChanges()).toBe(false);
  });

  it('error pada push/pull mengembalikan status error dan tidak update lastPulledAt', async () => {
    const db = makeDb();
    const adapter = new MockSyncAdapter();
    const service = new SyncService(db, adapter, { isOnline: () => true, now: () => 7777 });

    await createProduct(db);
    adapter.failNextPushWith('network error push');

    const result = await service.synchronize();
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('network error');
    }
    expect(await service.getLastPulledAt()).toBe(0);

    adapter.failNextPullWith('network error pull');
    const pullFail = await service.synchronize();
    expect(pullFail.status).toBe('error');

    const status = await service.getSyncStatus();
    expect(status.status).toBe('error');
    expect(status.error).toBeDefined();

    adapter.setTimestamp(8888);
    const ok = await service.synchronize();
    expect(ok.status).toBe('ok');
    expect((await service.getSyncStatus()).status).toBe('synced');
  });

  it('core flow tetap jalan offline penuh — CheckoutService atomic tanpa sync', async () => {
    const db = makeDb();
    const adapter = new MockSyncAdapter();
    const sync = new SyncService(db, adapter, { isOnline: () => false });
    const checkout = new CheckoutService(db, { now: () => 1700000000000 });

    const product = await createProduct(db);
    const user = await createUser(db);
    await db.write(async () => {
      await db.get<Shift>('shifts').create((raw) => {
        raw.userId = user.id;
        raw.openedAt = 1;
        raw.closedAt = null;
        raw.openingCash = 100000;
        raw.closingCash = null;
        raw.expectedCash = null;
        raw.difference = null;
        raw.status = 'open';
        raw.notes = null;
        raw.createdAt = 1;
        raw.updatedAt = 1;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', 1);
      });
    });
    const shift = (await db.get<Shift>('shifts').query().fetch())[0];

    const result = await checkout.checkout({
      shiftId: shift.id,
      userId: user.id,
      items: [{ productId: product.id, qty: 2, unitPrice: 3500, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [{ method: 'cash', amount: 7000 }],
      status: 'paid',
    });

    expect(result.status).toBe('ok');
    expect(adapter.pushHistory).toHaveLength(0);

    const syncStatus = await sync.getSyncStatus();
    expect(syncStatus.isOnline).toBe(false);
    expect(syncStatus.pendingCount).toBeGreaterThanOrEqual(1);

    const pendingCount = await sync.getPendingCount();
    expect(pendingCount).toBeGreaterThanOrEqual(3);
  });

  it('getPendingCount menghitung semua domain tables dan hasUnsyncedChanges konsisten', async () => {
    const db = makeDb();
    const adapter = new MockSyncAdapter();
    const service = new SyncService(db, adapter, { isOnline: () => true });

    expect(await service.getPendingCount()).toBe(0);
    expect(await service.hasUnsyncedChanges()).toBe(false);

    await createProduct(db);
    await createProduct(db, { name: 'Produk B' });

    const count = await service.getPendingCount();
    expect(count).toBe(2);
    expect(await service.hasUnsyncedChanges()).toBe(true);

    adapter.setTimestamp(1);
    await service.synchronize();
    expect(await service.getPendingCount()).toBe(0);
    expect(await service.hasUnsyncedChanges()).toBe(false);
  });

  it('settings key last_pulled_at disimpan sebagai string integer', async () => {
    const db = makeDb();
    const adapter = new MockSyncAdapter();
    const service = new SyncService(db, adapter, { now: () => 42, isOnline: () => true });
    await service.setLastPulledAt(4242);
    const rows = await db.get<Setting>('settings').query(Q.where('key', LAST_PULLED_AT_KEY)).fetch();
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('4242');
    expect(await service.getLastPulledAt()).toBe(4242);
  });
});
