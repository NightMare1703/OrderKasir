import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';

import Category from '../../database/models/category';
import Product from '../../database/models/product';
import Setting from '../../database/models/setting';
import StockMovement from '../../database/models/stock-movement';
import User from '../../database/models/user';
import { appDatabaseSchema } from '../../database/schema';
import { PRODUCT_CSV_HEADERS } from '../../utils/csv';
import { ProductImportService } from '../ProductImportService';
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

const createUser = async (db: Database): Promise<User> => {
  let created: User | undefined;
  await db.write(async () => {
    created = await db.get<User>('users').create((record) => {
      record.name = 'Budi';
      record.pinHash = 'hash';
      record.role = 'admin';
      record.isActive = true;
      record.createdAt = 1;
      record.updatedAt = 1;
      record._setRaw('deleted', false);
      record._setRaw('last_modified', 1);
    });
  });
  if (!created) throw new Error('gagal membuat user');
  return created;
};

const header = PRODUCT_CSV_HEADERS.join(',');

const makeCsv = (...rows: string[]) => [header, ...rows].join('\n');

describe('ProductImportService - template & export', () => {
  it('getTemplate menghasilkan header + 3 contoh', async () => {
    const db = makeDb();
    const service = new ProductImportService(db);
    const template = service.getTemplate();
    const lines = template.split('\n');
    expect(lines[0]).toBe(header);
    expect(lines.length).toBe(4);
    expect(template).toContain('Indomie Goreng');
  });

  it('exportAll mengembalikan CSV dengan produk yang ada', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csvInput = makeCsv(
      'Indomie Goreng,8998866200011,Makanan Instan,pcs,,2500,3500,48,12,true',
      'Teh Pucuk,,Minuman,pcs,,3000,4000,10,5,true',
    );
    const importResult = await service.importFromCsv(csvInput, user.id);
    expect(importResult.successCount).toBe(2);

    const exported = await service.exportAll();
    const lines = exported.split('\n');
    expect(lines[0]).toBe(header);
    expect(exported).toContain('Indomie Goreng');
    expect(exported).toContain('Teh Pucuk');
  });
});

describe('ProductImportService - importFromCsv (T2.2)', () => {
  it('import valid: buat produk + stok via StockService type in + kategori', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csv = makeCsv('Indomie Goreng,8998866200011,Makanan Instan,pcs,,2500,3500,48,12,true');

    const result = await service.importFromCsv(csv, user.id);

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(result.totalRows).toBe(1);
    expect(result.errors).toHaveLength(0);

    const products = await db.get<Product>('products').query().fetch();
    const activeProducts = products.filter((product) => !product._getRaw('deleted'));
    expect(activeProducts).toHaveLength(1);
    const product = activeProducts[0];
    expect(product.name).toBe('Indomie Goreng');
    expect(product.barcode).toBe('8998866200011');
    expect(product.stock).toBe(48);
    expect(product.minStock).toBe(12);

    const stockService = new StockService(db);
    const movements = await stockService.listMovements(product.id);
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('in');
    expect(movements[0].qty).toBe(48);
    expect(movements[0].reason).toBe('Impor CSV');
    expect(movements[0].refType).toBe('import');
    expect(movements[0].stockBefore).toBe(0);
    expect(movements[0].stockAfter).toBe(48);

    const categories = await db.get<Category>('categories').query().fetch();
    expect(categories.some((category) => category.name === 'Makanan Instan')).toBe(true);
  });

  it('baris rusak dilaporkan per-baris tanpa menggagalkan yang lain', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csv = makeCsv(
      'Indomie Goreng,001,Snack,pcs,,2500,3500,10,2,true',
      ',,Snack,pcs,,2500,3500,5,2,true',
      'Teh Pucuk,,Minuman,pcs,,3000,4000,20,5,true',
    );

    const result = await service.importFromCsv(csv, user.id);

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.totalRows).toBe(3);
    expect(result.errors.some((error) => error.row === 3)).toBe(true);

    const products = await db.get<Product>('products').query().fetch();
    const active = products.filter((product) => !product._getRaw('deleted'));
    expect(active).toHaveLength(2);
  });

  it('barcode duplikat di file dilaporkan', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csv = makeCsv(
      'Produk A,123,Snack,pcs,,2500,3500,5,2,true',
      'Produk B,123,Snack,pcs,,2500,3500,5,2,true',
    );

    const result = await service.importFromCsv(csv, user.id);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.errors.some((error) => error.code === 'barcode_duplicate_in_file')).toBe(true);
  });

  it('barcode duplikat existing DB dilaporkan', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);

    const first = makeCsv('Indomie Goreng,8998866200011,Snack,pcs,,2500,3500,5,2,true');
    await service.importFromCsv(first, user.id);

    const second = makeCsv('Duplikat,8998866200011,Snack,pcs,,2500,3500,5,2,true');
    const result = await service.importFromCsv(second, user.id);
    expect(result.successCount).toBe(0);
    expect(result.errors.some((error) => error.code === 'barcode_duplicate')).toBe(true);
  });

  it('header invalid: tidak ada produk dibuat', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csv = 'nama,salah\nIndomie,123';

    const result = await service.importFromCsv(csv, user.id);
    expect(result.successCount).toBe(0);
    expect(result.errors[0].code).toBe('header_invalid');
    const products = await db.get<Product>('products').query().fetch();
    expect(products).toHaveLength(0);
  });

  it('user tidak ditemukan: semua gagal dengan error user_not_found', async () => {
    const db = makeDb();
    const service = new ProductImportService(db);
    const csv = makeCsv('Kopi,,Snack,pcs,,2500,3500,5,2,true');
    const result = await service.importFromCsv(csv, 'tidak-ada');
    expect(result.successCount).toBe(0);
    expect(result.errors.some((error) => error.code === 'user_not_found')).toBe(true);
  });

  it('stok 0 tidak membuat stock_movement', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csv = makeCsv('Kopi,,Snack,pcs,,2500,3500,0,2,true');
    const result = await service.importFromCsv(csv, user.id);
    expect(result.successCount).toBe(1);
    const product = (await db.get<Product>('products').query().fetch()).find((item) => !item._getRaw('deleted')) as Product;
    expect(product.stock).toBe(0);
    const movements = await new StockService(db).listMovements(product.id);
    expect(movements).toHaveLength(0);
  });

  it('sell_price < cost_price tetap disimpan dengan warning', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csv = makeCsv('Promo Rugi,,Snack,pcs,,10000,8000,5,2,true');
    const result = await service.importFromCsv(csv, user.id);
    expect(result.successCount).toBe(1);
    expect(result.warningCount).toBe(1);
    expect(result.successes[0].warnings).toContain('sell_price_below_cost');
  });

  it('is_active false membuat produk nonaktif', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csv = makeCsv('Kopi,,Snack,pcs,,2500,3500,5,2,false');
    await service.importFromCsv(csv, user.id);
    const product = (await db.get<Product>('products').query().fetch()).find((item) => !item._getRaw('deleted')) as Product;
    expect(product.isActive).toBe(false);
  });

  it('custom unit label valid', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csv = makeCsv('Telur,,Bahan,custom,ikat,25000,30000,10,2,true');
    const result = await service.importFromCsv(csv, user.id);
    expect(result.successCount).toBe(1);
    const product = (await db.get<Product>('products').query().fetch()).find((item) => !item._getRaw('deleted')) as Product;
    expect(product.unit).toBe('custom');
    expect(product.customUnitLabel).toBe('ikat');
  });

  it('file kosong lapor empty_file', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const result = await service.importFromCsv('', user.id);
    expect(result.successCount).toBe(0);
    expect(result.errors.some((error) => error.code === 'empty_file')).toBe(true);
  });

  it('quoted field dengan koma berhasil', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csv = makeCsv('"Kopi, Susu",001,Minuman,pcs,,5000,7000,10,2,true');
    const result = await service.importFromCsv(csv, user.id);
    expect(result.successCount).toBe(1);
    const product = (await db.get<Product>('products').query().fetch()).find((item) => !item._getRaw('deleted')) as Product;
    expect(product.name).toBe('Kopi, Susu');
  });

  it('kategori sama dipakai ulang tanpa duplikasi', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const service = new ProductImportService(db);
    const csv = makeCsv(
      'A,,Snack,pcs,,1000,1500,5,2,true',
      'B,,Snack,pcs,,1000,1500,5,2,true',
    );
    await service.importFromCsv(csv, user.id);
    const categories = await db.get<Category>('categories').query().fetch();
    const snackCategories = categories.filter((cat) => cat.name === 'Snack' && !cat._getRaw('deleted'));
    expect(snackCategories).toHaveLength(1);
  });
});
