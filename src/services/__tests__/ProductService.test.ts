import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';

import Category from '../../database/models/category';
import Product from '../../database/models/product';
import { appDatabaseSchema } from '../../database/schema';
import { matchesProductName, ProductService } from '../ProductService';

logger.silence();

const makeDb = () => {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    extraLokiOptions: { autosave: false },
  });
  return new Database({ adapter, modelClasses: [Category, Product] });
};

type TestHarness = {
  db: Database;
  service: ProductService;
  advanceMs: (ms: number) => void;
};

const makeHarness = (): TestHarness => {
  const db = makeDb();
  let currentTime = 1_000_000;
  const service = new ProductService(db, { now: () => currentTime });
  return {
    db,
    service,
    advanceMs: (ms) => {
      currentTime += ms;
    },
  };
};

const validInput = {
  name: 'Indomie Goreng',
  barcode: '8998866200011',
  categoryId: null,
  unit: 'pcs',
  costPrice: 2_500,
  sellPrice: 3_500,
  stock: 48,
  minStock: 12,
};

// Produk dibuat langsung via db.write untuk menyiapkan kondisi awal;
// jalur create yang benar diuji lewat service.create.
const seedProduct = async (
  db: Database,
  overrides: Partial<{
    name: string;
    barcode: string | null;
    unit: string;
    costPrice: number;
    sellPrice: number;
  }> = {},
): Promise<Product> => {
  let created: Product | undefined;
  await db.write(async () => {
    created = await db.get<Product>('products').create((raw) => {
      raw.name = 'Teh Pucuk 350ml';
      raw.barcode = null;
      raw.categoryId = null;
      raw.unit = 'pcs';
      raw.costPrice = 3_000;
      raw.sellPrice = 4_000;
      raw.stock = 24;
      raw.minStock = 6;
      raw.isActive = true;
      raw.createdAt = 1;
      raw.updatedAt = 1;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', 1);
    });
  });
  if (!created) throw new Error('gagal membuat produk uji');
  const product: Product = created;
  if (Object.keys(overrides).length > 0) {
    await db.write(async () => {
      await product.update((raw) => {
        if (overrides.name !== undefined) raw.name = overrides.name;
        if (overrides.barcode !== undefined) raw.barcode = overrides.barcode;
        if (overrides.unit !== undefined) raw.unit = overrides.unit as never;
        if (overrides.costPrice !== undefined) raw.costPrice = overrides.costPrice;
        if (overrides.sellPrice !== undefined) raw.sellPrice = overrides.sellPrice;
      });
    });
  }
  return created;
};

describe('matchesProductName (fuzzy nama)', () => {
  it.each([
    ['Indomie Goreng', 'indomie', true],
    ['Indomie Goreng', 'INDOMIE GORENG', true],
    ['Indomie Goreng', 'indm grg', true],
    ['Teh Pucuk 350ml', 'teh', true],
    ['Teh Pucuk 350ml', 'pucuk teh', true],
    ['Indomie Goreng', 'xyz', false],
    ['Indomie Goreng', 'goreng xyz', false],
    ['Beras Pandan Wangi 5kg', '', true],
  ])('%s ~ %s -> %p', (name, query, expected) => {
    expect(matchesProductName(name, query)).toBe(expected);
  });
});

describe('ProductService create', () => {
  it('membuat produk lengkap dengan deleted=false dan last_modified terisi', async () => {
    const { service } = makeHarness();

    const result = await service.create(validInput);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.product.name).toBe('Indomie Goreng');
    expect(result.product.barcode).toBe('8998866200011');
    expect(result.product.unit).toBe('pcs');
    expect(result.product.costPrice).toBe(2_500);
    expect(result.product.sellPrice).toBe(3_500);
    expect(result.product.stock).toBe(48);
    expect(result.product.minStock).toBe(12);
    expect(result.product.isActive).toBe(true);
    expect(result.product._getRaw('deleted')).toBe(false);
    expect(result.product._getRaw('last_modified')).toBe(1_000_000);
    expect(result.warnings).toEqual([]);
  });

  it('barcode kosong/whitespace dinormalisasi menjadi null', async () => {
    const { service } = makeHarness();
    const result = await service.create({ ...validInput, name: 'Gula Pasir 1kg', barcode: '   ' });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.product.barcode).toBeNull();
    }
  });

  it.each([
    ['nama kosong', { name: '   ' }, 'name'],
    ['HPP negatif', { costPrice: -1 }, 'costPrice'],
    ['HPP desimal', { costPrice: 2500.5 }, 'costPrice'],
    ['harga jual nol', { sellPrice: 0 }, 'sellPrice'],
    ['stok negatif', { stock: -5 }, 'stock'],
    ['stok desimal', { stock: 1.5 }, 'stock'],
    ['min stok negatif', { minStock: -1 }, 'minStock'],
    ['satuan tidak dikenal', { unit: 'dus' }, 'unit'],
  ])('input ditolak: %s', async (_label, overrides, expectedField) => {
    const { service } = makeHarness();
    const result = await service.create({ ...validInput, ...overrides });

    expect(result.status).toBe('validation_failed');
    if (result.status === 'validation_failed') {
      expect(result.issues.map((issue) => issue.field)).toContain(expectedField);
    }
  });

  it('barcode duplikat ditolak', async () => {
    const { service } = makeHarness();
    await service.create(validInput);

    const result = await service.create({ ...validInput, name: 'Duplikat' });

    expect(result).toEqual({
      status: 'barcode_duplicate',
      barcode: '8998866200011',
    });
  });

  it('banyak produk tanpa barcode boleh ada sekaligus', async () => {
    const { service } = makeHarness();

    const first = await service.create({ ...validInput, name: 'A', barcode: null });
    const second = await service.create({
      ...validInput,
      name: 'B',
      barcode: '',
      sellPrice: 4_000,
    });

    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
  });

  it('kategori yang tidak ada ditolak; kategori aktif diterima', async () => {
    const { db, service } = makeHarness();

    let category: Category | undefined;
    await db.write(async () => {
      category = await db.get<Category>('categories').create((raw) => {
        raw.name = 'Makanan Instan';
        raw.createdAt = 1;
        raw.updatedAt = 1;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', 1);
      });
    });
    if (!category) throw new Error('gagal membuat kategori uji');

    const missing = await service.create({ ...validInput, categoryId: 'tidak-ada' });
    expect(missing.status).toBe('category_not_found');

    const ok = await service.create({ ...validInput, categoryId: category.id });
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') {
      expect(ok.product.categoryId).toBe(category.id);
    }
  });
});

describe('ProductService warning harga jual < HPP (non-blocking)', () => {
  it('memberi warning tapi tetap menyimpan', async () => {
    const { service } = makeHarness();

    const result = await service.create({
      ...validInput,
      name: 'Promo Rugi',
      barcode: null,
      costPrice: 10_000,
      sellPrice: 8_000,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.warnings).toEqual(['sell_price_below_cost']);
      expect(result.product.sellPrice).toBe(8_000);
    }
  });

  it.each([
    ['harga sama dengan HPP', 10_000, 10_000],
    ['harga di atas HPP', 10_000, 12_500],
  ])('%s → tanpa warning', async (_label, costPrice, sellPrice) => {
    const { service } = makeHarness();
    const result = await service.create({ ...validInput, barcode: null, costPrice, sellPrice });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.warnings).toEqual([]);
    }
  });

  it('warning juga muncul saat update', async () => {
    const { db, service } = makeHarness();
    const product = await seedProduct(db);

    const result = await service.update(product.id, {
      name: product.name,
      barcode: null,
      categoryId: null,
      unit: 'pcs',
      costPrice: 5_000,
      sellPrice: 4_000,
      minStock: 6,
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.warnings).toEqual(['sell_price_below_cost']);
    }
  });
});

describe('ProductService update', () => {
  const updatePayload = {
    name: 'Teh Pucuk 350ml (baru)',
    barcode: '8992388881819',
    categoryId: null,
    unit: 'pack',
    costPrice: 3_200,
    sellPrice: 4_200,
    minStock: 10,
  };

  it('memperbarui field dan last_modified tanpa menyentuh stok', async () => {
    const { db, service, advanceMs } = makeHarness();
    const product = await seedProduct(db);
    advanceMs(5_000);

    // stock dikirim ikut payload harusnya di-strip: perubahan stok hanya via StockService
    const result = await service.update(product.id, { ...updatePayload, stock: 999 });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.product.name).toBe('Teh Pucuk 350ml (baru)');
    expect(result.product.unit).toBe('pack');
    expect(result.product.costPrice).toBe(3_200);
    expect(result.product.sellPrice).toBe(4_200);
    expect(result.product.minStock).toBe(10);
    expect(result.product.stock).toBe(24); // tidak berubah
    expect(result.product.updatedAt).toBe(1_005_000);
    expect(result.product._getRaw('last_modified')).toBe(1_005_000);
  });

  it('barcode milik sendiri tidak dianggap duplikat', async () => {
    const { db, service } = makeHarness();
    const product = await seedProduct(db, { barcode: '8992753100017' });

    const result = await service.update(product.id, {
      ...updatePayload,
      barcode: '8992753100017',
    });

    expect(result.status).toBe('ok');
  });

  it('update ke barcode milik produk lain ditolak', async () => {
    const { db, service } = makeHarness();
    await service.create(validInput); // pemegang barcode 8998866200011
    const target = await seedProduct(db);

    const result = await service.update(target.id, {
      ...updatePayload,
      barcode: '8998866200011',
    });

    expect(result).toEqual({
      status: 'barcode_duplicate',
      barcode: '8998866200011',
    });
  });

  it('produk yang sudah dihapus tidak bisa di-update', async () => {
    const { db, service } = makeHarness();
    const product = await seedProduct(db);
    await service.softDelete(product.id);

    const result = await service.update(product.id, updatePayload);

    expect(result.status).toBe('not_found');
  });
});

describe('ProductService softDelete', () => {
  it('menandai deleted=true dan memperbarui last_modified', async () => {
    const { db, service, advanceMs } = makeHarness();
    const product = await seedProduct(db);
    advanceMs(2_000);

    const result = await service.softDelete(product.id);

    expect(result.status).toBe('ok');
    expect(product._getRaw('deleted')).toBe(true);
    expect(product._getRaw('last_modified')).toBe(1_002_000);
  });

  it('produk terhapus tidak ditemukan lagi via id/barcode', async () => {
    const { service } = makeHarness();
    const created = await service.create(validInput);
    if (created.status !== 'ok') throw new Error('setup gagal');
    await service.softDelete(created.product.id);

    await expect(service.getById(created.product.id)).resolves.toBeNull();
    await expect(service.getByBarcode('8998866200011')).resolves.toBeNull();
  });

  it('barcode produk terhapus boleh dipakai produk baru', async () => {
    const { service } = makeHarness();
    const first = await service.create(validInput);
    if (first.status !== 'ok') throw new Error('setup gagal');
    await service.softDelete(first.product.id);

    const second = await service.create({ ...validInput, name: 'Indomie Goreng Revisi' });

    expect(second.status).toBe('ok');
  });

  it('produk yang tidak ada dilaporkan not_found', async () => {
    const { service } = makeHarness();
    expect(await service.softDelete('tidak-ada')).toEqual({ status: 'not_found' });
    expect(await service.getById('tidak-ada')).toBeNull();
    expect(await service.getByBarcode('tidak-ada')).toBeNull();
  });
});
