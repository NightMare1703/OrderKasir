import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { where } from '@nozbe/watermelondb/QueryDescription';
import logger from '@nozbe/watermelondb/utils/common/logger';

import Category from '../models/category';
import Product from '../models/product';
import Setting from '../models/setting';
import User from '../models/user';
import { appDatabaseSchema } from '../schema';

// Test in-memory: matikan autosave (setInterval-nya menjaga event loop Jest tetap hidup).
logger.silence();

const makeAdapter = () =>
  new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    extraLokiOptions: { autosave: false },
  });

const makeDb = () =>
  new Database({
    adapter: makeAdapter(),
    modelClasses: [Category, Product, Setting, User],
  });

describe('schema v1 part 2: categories & products (T1.1)', () => {
  it('membuat kategori dan produk terhubung relasi + kolom sync', async () => {
    const db = makeDb();
    const categories = db.get<Category>('categories');
    const products = db.get<Product>('products');

    const minuman = await db.write(async () =>
      categories.create((category) => {
        category.name = 'Minuman';
        category.createdAt = 1756200000000;
        category.updatedAt = 1756200000000;
      }),
    );

    const tehPucuk = await db.write(async () =>
      products.create((product) => {
        product.name = 'Teh Pucuk 350ml';
        product.barcode = '8998009090111';
        product.categoryId = minuman.id;
        product.unit = 'pcs';
        product.costPrice = 2500;
        product.sellPrice = 4000;
        product.stock = 48;
        product.minStock = 12;
        product.isActive = true;
        product.createdAt = 1756200000000;
        product.updatedAt = 1756200000000;
      }),
    );

    const foundProduct = await products.find(tehPucuk.id);
    expect(foundProduct.name).toBe('Teh Pucuk 350ml');
    expect(foundProduct.categoryId).toBe(minuman.id);
    expect(foundProduct.sellPrice).toBe(4000);
    expect(Number.isInteger(foundProduct.sellPrice)).toBe(true);
    expect(foundProduct.stock).toBe(48);
    expect(foundProduct.isActive).toBe(true);
    expect(foundProduct.barcode).toBe('8998009090111');
    expect(foundProduct.photoPath).toBeNull();
    expect(typeof foundProduct._getRaw('last_modified')).toBe('number');
    expect(foundProduct._getRaw('deleted')).toBe(false);

    const foundCategory = await categories.find(minuman.id);
    expect(foundCategory.name).toBe('Minuman');
    expect(typeof foundCategory._getRaw('last_modified')).toBe('number');
    expect(foundCategory._getRaw('deleted')).toBe(false);

    await db.write(() => db.unsafeResetDatabase());
  });

  it('produk tanpa barcode & kategori tetap valid (sparse)', async () => {
    const db = makeDb();
    const products = db.get<Product>('products');

    await db.write(async () =>
      products.create((product) => {
        product.name = 'Gula Pasir 1kg';
        product.unit = 'pack';
        product.costPrice = 14000;
        product.sellPrice = 17000;
        product.stock = 10;
        product.minStock = 3;
        product.isActive = true;
        product.createdAt = 1756200000000;
        product.updatedAt = 1756200000000;
      }),
    );

    const rows = await products.query().fetch();
    expect(rows).toHaveLength(1);
    expect(rows[0].barcode).toBeNull();
    expect(rows[0].categoryId).toBeNull();

    await db.write(() => db.unsafeResetDatabase());
  });

  it('query berdasarkan barcode dan category_id lewat index', async () => {
    const db = makeDb();
    const categories = db.get<Category>('categories');
    const products = db.get<Product>('products');

    const makanan = await db.write(async () =>
      categories.create((category) => {
        category.name = 'Makanan';
        category.createdAt = 1756200000000;
        category.updatedAt = 1756200000000;
      }),
    );

    await db.write(async () => {
      await products.create((product) => {
        product.name = 'Indomie Goreng';
        product.barcode = '8998866200011';
        product.categoryId = makanan.id;
        product.unit = 'pcs';
        product.costPrice = 2800;
        product.sellPrice = 3500;
        product.stock = 100;
        product.minStock = 24;
        product.isActive = true;
        product.createdAt = 1756200000000;
        product.updatedAt = 1756200000000;
      });
      await products.create((product) => {
        product.name = 'Chitato Sapi Panggang';
        product.categoryId = makanan.id;
        product.unit = 'pcs';
        product.costPrice = 7000;
        product.sellPrice = 9500;
        product.stock = 30;
        product.minStock = 6;
        product.isActive = true;
        product.createdAt = 1756200000000;
        product.updatedAt = 1756200000000;
      });
    });

    const byBarcode = await products
      .query(where('barcode', '8998866200011'))
      .fetch();
    expect(byBarcode).toHaveLength(1);
    expect(byBarcode[0].name).toBe('Indomie Goreng');

    const byCategory = await products
      .query(where('category_id', makanan.id))
      .fetch();
    expect(byCategory).toHaveLength(2);

    await db.write(() => db.unsafeResetDatabase());
  });

  it('soft-delete produk tidak menghapus baris (immutable riwayat)', async () => {
    const db = makeDb();
    const products = db.get<Product>('products');

    const created = await db.write(async () =>
      products.create((product) => {
        product.name = 'Beras Pandan Wangi 5kg';
        product.unit = 'pack';
        product.costPrice = 62000;
        product.sellPrice = 75000;
        product.stock = 8;
        product.minStock = 2;
        product.isActive = true;
        product.createdAt = 1756200000000;
        product.updatedAt = 1756200000000;
      }),
    );

    await db.write(async () => {
      await created.update((product) => {
        product._setRaw('deleted', true);
      });
    });

    const stillThere = await products.find(created.id);
    expect(stillThere._getRaw('deleted')).toBe(true);

    await db.write(() => db.unsafeResetDatabase());
  });
});
