import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';

import Category from '../../database/models/category';
import Product from '../../database/models/product';
import Setting from '../../database/models/setting';
import StockMovement from '../../database/models/stock-movement';
import User from '../../database/models/user';
import { appDatabaseSchema } from '../../database/schema';
import { StockService } from '../StockService';

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
    modelClasses: [Category, Product, Setting, StockMovement, User],
  });
};

type TestHarness = {
  db: Database;
  service: StockService;
  advanceMs: (ms: number) => void;
  now: () => number;
};

const makeHarness = (): TestHarness => {
  const db = makeDb();
  let currentTime = 1_000_000;
  const service = new StockService(db, { now: () => currentTime });
  return {
    db,
    service,
    advanceMs: (ms) => {
      currentTime += ms;
    },
    now: () => currentTime,
  };
};

const createProduct = async (
  db: Database,
  overrides: Partial<{ stock: number; name: string }> = {},
): Promise<Product> => {
  const { stock = 50, name = 'Indomie Goreng' } = overrides;
  let created: Product | undefined;
  await db.write(async () => {
    created = await db.get<Product>('products').create((raw) => {
      raw.name = name;
      raw.barcode = null;
      raw.categoryId = null;
      raw.unit = 'pcs';
      raw.costPrice = 2_500;
      raw.sellPrice = 3_500;
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

const createUser = async (db: Database, overrides: Partial<{ isActive: boolean }> = {}): Promise<User> => {
  const { isActive = true } = overrides;
  let created: User | undefined;
  await db.write(async () => {
    created = await db.get<User>('users').create((record) => {
      record.name = 'Budi';
      record.pinHash = 'plain$1234';
      record.role = 'admin';
      record.isActive = isActive;
      record.createdAt = 1;
      record.updatedAt = 1;
      record._setRaw('deleted', false);
      record._setRaw('last_modified', 1);
    });
  });
  if (!created) throw new Error('gagal membuat user uji');
  return created;
};

describe('StockService - math movement semua type (T1.4)', () => {
  it.each([
    ['in', 10, 50, 60],
    ['out', -7, 50, 43],
    ['sale', -3, 50, 47],
    ['void', 5, 50, 55],
    ['return', 4, 50, 54],
    ['adjustment', 6, 50, 56],
    ['adjustment', -8, 50, 42],
  ] as const)('type %s qty %p: %p -> %p', async (type, qty, before, expectedAfter) => {
    const { db, service, now } = makeHarness();
    const product = await createProduct(db, { stock: before });
    const user = await createUser(db);

    const result = await service.adjust({
      productId: product.id,
      type,
      qty,
      reason: type === 'adjustment' ? 'Opname stok' : 'Transaksi kasir',
      userId: user.id,
      refType: type === 'sale' ? 'transaction' : null,
      refId: type === 'sale' ? 'INV-20260827-0001' : null,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.movement.type).toBe(type);
    expect(result.movement.qty).toBe(qty);
    expect(result.movement.stockBefore).toBe(before);
    expect(result.movement.stockAfter).toBe(expectedAfter);
    expect(result.movement.qty).toBe(result.movement.stockAfter - result.movement.stockBefore);
    expect(result.product.stock).toBe(expectedAfter);
    expect(product.stock).toBe(expectedAfter);
    expect(result.movement.reason).toBe(type === 'adjustment' ? 'Opname stok' : 'Transaksi kasir');
    expect(result.movement.productId).toBe(product.id);
    expect(result.movement.userId).toBe(user.id);
    expect(result.movement.createdAt).toBe(now());
    expect(result.movement.updatedAt).toBe(now());
    expect(result.movement._getRaw('deleted')).toBe(false);
    expect(typeof result.movement._getRaw('last_modified')).toBe('number');
    expect(product._getRaw('last_modified')).toBe(now());
  });

  it('mencatat alasan, ref_type dan ref_id dengan benar (snapshot audit)', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 20 });
    const user = await createUser(db);

    const result = await service.adjust({
      productId: product.id,
      type: 'in',
      qty: 15,
      reason: 'Barang masuk dari supplier',
      refType: 'import',
      refId: 'CSV-001',
      userId: user.id,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.movement.reason).toBe('Barang masuk dari supplier');
    expect(result.movement.refType).toBe('import');
    expect(result.movement.refId).toBe('CSV-001');
  });

  it('listMovements terurut terbaru dulu', async () => {
    const { db, service, advanceMs } = makeHarness();
    const product = await createProduct(db, { stock: 100 });
    const user = await createUser(db);

    await service.adjust({
      productId: product.id,
      type: 'in',
      qty: 10,
      reason: 'awal',
      userId: user.id,
    });
    advanceMs(1_000);
    await service.adjust({
      productId: product.id,
      type: 'out',
      qty: -5,
      reason: 'rusak',
      userId: user.id,
    });

    const movements = await service.listMovements(product.id);
    expect(movements).toHaveLength(2);
    expect(movements[0].qty).toBe(-5);
    expect(movements[1].qty).toBe(10);
    expect(movements[0].createdAt).toBeGreaterThan(movements[1].createdAt);
  });
});

describe('StockService - stok tidak pernah negatif tanpa alasan eksplisit', () => {
  it('sale yang membuat stok negatif ditolak dan stok tidak berubah', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 5 });
    const user = await createUser(db);

    const result = await service.adjust({
      productId: product.id,
      type: 'sale',
      qty: -10,
      userId: user.id,
    });

    expect(result).toEqual({ status: 'negative_stock', stockBefore: 5, stockAfter: -5 });
    expect(product.stock).toBe(5);

    const movements = await service.listMovements(product.id);
    expect(movements).toHaveLength(0);
  });

  it('stok negatif diizinkan bila allowNegativeStock true (alasan eksplisit)', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 5 });
    const user = await createUser(db);

    const result = await service.adjust({
      productId: product.id,
      type: 'sale',
      qty: -10,
      userId: user.id,
      allowNegativeStock: true,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.movement.stockAfter).toBe(-5);
    expect(product.stock).toBe(-5);
  });

  it('out dan adjustment negatif juga dicegah tanpa allowNegativeStock', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 2 });
    const user = await createUser(db);

    const outResult = await service.adjust({
      productId: product.id,
      type: 'out',
      qty: -5,
      reason: 'hilang',
      userId: user.id,
    });
    expect(outResult.status).toBe('negative_stock');

    const adjResult = await service.adjust({
      productId: product.id,
      type: 'adjustment',
      qty: -5,
      reason: 'Opname',
      userId: user.id,
    });
    expect(adjResult.status).toBe('negative_stock');
    expect(product.stock).toBe(2);
  });

  it('batas stok 0 sah (tidak negatif)', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 10 });
    const user = await createUser(db);

    const result = await service.adjust({
      productId: product.id,
      type: 'sale',
      qty: -10,
      userId: user.id,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.movement.stockAfter).toBe(0);
    expect(product.stock).toBe(0);
  });
});

describe('StockService - validasi', () => {
  it('product_not_found bila produk tidak ada atau sudah dihapus', async () => {
    const { db, service } = makeHarness();
    const user = await createUser(db);

    const missing = await service.adjust({
      productId: 'tidak-ada',
      type: 'in',
      qty: 5,
      userId: user.id,
    });
    expect(missing).toEqual({ status: 'product_not_found', productId: 'tidak-ada' });

    const product = await createProduct(db);
    await db.write(async () => {
      await product.update((raw) => {
        raw._setRaw('deleted', true);
      });
    });
    const deleted = await service.adjust({
      productId: product.id,
      type: 'in',
      qty: 5,
      userId: user.id,
    });
    expect(deleted.status).toBe('product_not_found');
  });

  it('user_not_found bila user tidak ada', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db);

    const result = await service.adjust({
      productId: product.id,
      type: 'in',
      qty: 5,
      userId: 'user-tidak-ada',
    });
    expect(result).toEqual({ status: 'user_not_found', userId: 'user-tidak-ada' });
  });

  it('invalid_qty untuk qty 0, desimal, dan tanda salah per type', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db);
    const user = await createUser(db);

    expect(
      await service.adjust({ productId: product.id, type: 'in', qty: 0, userId: user.id }),
    ).toMatchObject({ status: 'invalid_qty' });

    expect(
      await service.adjust({ productId: product.id, type: 'in', qty: 2.5, userId: user.id }),
    ).toMatchObject({ status: 'invalid_qty' });

    expect(
      await service.adjust({ productId: product.id, type: 'in', qty: -5, userId: user.id }),
    ).toMatchObject({ status: 'invalid_qty' });

    expect(
      await service.adjust({ productId: product.id, type: 'out', qty: 5, userId: user.id }),
    ).toMatchObject({ status: 'invalid_qty' });

    expect(
      await service.adjust({ productId: product.id, type: 'sale', qty: 3, userId: user.id }),
    ).toMatchObject({ status: 'invalid_qty' });

    expect(
      await service.adjust({ productId: product.id, type: 'void', qty: -3, userId: user.id }),
    ).toMatchObject({ status: 'invalid_qty' });

    expect(
      await service.adjust({
        productId: product.id,
        type: 'return',
        qty: -2,
        userId: user.id,
      }),
    ).toMatchObject({ status: 'invalid_qty' });
  });

  it('reason_required untuk adjustment tanpa alasan', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db);
    const user = await createUser(db);

    const noReason = await service.adjust({
      productId: product.id,
      type: 'adjustment',
      qty: 5,
      userId: user.id,
    });
    expect(noReason).toEqual({ status: 'reason_required' });

    const blankReason = await service.adjust({
      productId: product.id,
      type: 'adjustment',
      qty: 5,
      reason: '   ',
      userId: user.id,
    });
    expect(blankReason).toEqual({ status: 'reason_required' });
  });

  it('invalid_type untuk type tidak dikenal', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db);
    const user = await createUser(db);

    const result = await (service.adjust as unknown as (input: unknown) => Promise<unknown>)({
      productId: product.id,
      type: 'unknown',
      qty: 5,
      userId: user.id,
    });
    expect(result).toEqual({ status: 'invalid_type', type: 'unknown' });
  });

  it('atomic: gagal validasi tidak menulis product maupun movement', async () => {
    const { db, service } = makeHarness();
    const product = await createProduct(db, { stock: 30 });
    const user = await createUser(db);

    await service.adjust({
      productId: product.id,
      type: 'adjustment',
      qty: 5,
      userId: user.id,
    });

    const beforeMovements = await service.listMovements(product.id);
    const beforeStock = product.stock;

    const failed = await service.adjust({
      productId: product.id,
      type: 'adjustment',
      qty: 5,
      // tanpa reason -> gagal
      userId: user.id,
    });
    expect(failed.status).toBe('reason_required');

    const afterMovements = await service.listMovements(product.id);
    expect(afterMovements).toHaveLength(beforeMovements.length);
    expect(product.stock).toBe(beforeStock);
  });
});
