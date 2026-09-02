import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';

import Payment from '../../database/models/payment';
import Product from '../../database/models/product';
import Setting from '../../database/models/setting';
import StockMovement from '../../database/models/stock-movement';
import Transaction from '../../database/models/transaction';
import TransactionItem from '../../database/models/transaction-item';
import User from '../../database/models/user';
import Category from '../../database/models/category';
import Customer from '../../database/models/customer';
import { appDatabaseSchema } from '../../database/schema';
import { CheckoutService } from '../CheckoutService';
import { ReceiptService } from '../ReceiptService';
import { MockPrinterAdapter } from '../../hardware/printer/mockPrinterAdapter';
import { bytesToAscii, containsText } from '../../hardware/printer/escpos';
import { PRINTER_ERROR_MESSAGE } from '../../hardware/printer/types';

logger.silence();

const FIXED_NOW = new Date(2026, 7, 27, 14, 5, 0).getTime();

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
      Category,
      Customer,
      Payment,
      Product,
      Setting,
      StockMovement,
      Transaction,
      TransactionItem,
      User,
    ],
  });
};

const createUser = async (db: Database, overrides: Partial<{ name: string }> = {}): Promise<User> => {
  let created: User | undefined;
  await db.write(async () => {
    created = await db.get<User>('users').create((r) => {
      r.name = overrides.name ?? 'Sari';
      r.pinHash = 'hash';
      r.role = 'kasir';
      r.isActive = true;
      r.createdAt = FIXED_NOW;
      r.updatedAt = FIXED_NOW;
      r._setRaw('deleted', false);
      r._setRaw('last_modified', FIXED_NOW);
    });
  });
  if (!created) throw new Error('gagal membuat user uji');
  return created;
};

const createProduct = async (
  db: Database,
  overrides: Partial<{ name: string; stock: number; sellPrice: number }> = {},
): Promise<Product> => {
  let created: Product | undefined;
  await db.write(async () => {
    created = await db.get<Product>('products').create((raw) => {
      raw.name = overrides.name ?? 'Indomie Goreng';
      raw.barcode = null;
      raw.categoryId = null;
      raw.unit = 'pcs';
      raw.customUnitLabel = null;
      raw.costPrice = 2500;
      raw.sellPrice = overrides.sellPrice ?? 3500;
      raw.stock = overrides.stock ?? 50;
      raw.minStock = 5;
      raw.isActive = true;
      raw.createdAt = FIXED_NOW;
      raw.updatedAt = FIXED_NOW;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', FIXED_NOW);
    });
  });
  if (!created) throw new Error('gagal membuat produk uji');
  return created;
};

const createSetting = async (db: Database, key: string, value: string) => {
  await db.write(async () => {
    await db.get<Setting>('settings').create((r) => {
      r.key = key;
      r.value = value;
    });
  });
};

const createTransactionViaCheckout = async (
  db: Database,
  userId: string,
  productIds: string[],
): Promise<{ transaction: Transaction; items: TransactionItem[] }> => {
  const checkout = new CheckoutService(db, { now: () => FIXED_NOW });
  const items = productIds.map((pid) => ({
    productId: pid,
    qty: 1,
    unitPrice: 4000,
    discount: 0,
  }));
  const result = await checkout.checkout({
    shiftId: 'shift-1',
    userId,
    items,
    transactionDiscount: 0,
    tax: 0,
    payments: [{ method: 'cash', amount: 4000 * productIds.length }],
    status: 'paid',
  });
  if (result.status !== 'ok') throw new Error(`checkout gagal: ${result.status}`);
  const allItems = await db.get<TransactionItem>('transaction_items').query().fetch();
  return { transaction: result.transaction, items: allItems };
};

describe('ReceiptService (T2.5)', () => {
  it('getReceiptData membangun snapshot sesuai PRD §5.3 (toko, INV, kasir, item snapshot)', async () => {
    const db = makeDb();
    const user = await createUser(db, { name: 'Sari Kasir' });
    const p1 = await createProduct(db, { name: 'Indomie Goreng', sellPrice: 3500 });
    const p2 = await createProduct(db, { name: 'Teh Pucuk 350ml', sellPrice: 4000 });

    await createSetting(db, 'store_name', JSON.stringify('Toko Budi'));
    await createSetting(db, 'store_address', JSON.stringify('Jl. Melati No. 10'));
    await createSetting(db, 'receipt_footer', JSON.stringify('Terima kasih sudah belanja'));

    const { transaction } = await createTransactionViaCheckout(db, user.id, [p1.id, p2.id]);

    const adapter = new MockPrinterAdapter();
    const service = new ReceiptService(db, adapter);
    const data = await service.getReceiptData(transaction.id);

    expect(data).not.toBeNull();
    if (!data) return;
    expect(data.storeName).toBe('Toko Budi');
    expect(data.storeAddress).toBe('Jl. Melati No. 10');
    expect(data.footerText).toBe('Terima kasih sudah belanja');
    expect(data.invoiceNo).toBe('INV-20260827-0001');
    expect(data.timestamp).toBe(FIXED_NOW);
    expect(data.cashierName).toBe('Sari Kasir');
    expect(data.items).toHaveLength(2);
    expect(data.items.some((i) => i.name === 'Indomie Goreng')).toBe(true);
    expect(data.items.some((i) => i.name === 'Teh Pucuk 350ml')).toBe(true);
    expect(data.subtotal).toBe(8000);
    expect(data.total).toBe(8000);
    expect(data.payments[0].method).toBe('cash');
    expect(data.payments[0].amount).toBe(8000);
  });

  it('fallback nama toko OrderKasir & footer default bila setting kosong', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const product = await createProduct(db);
    const { transaction } = await createTransactionViaCheckout(db, user.id, [product.id]);
    const service = new ReceiptService(db, new MockPrinterAdapter());
    const data = await service.getReceiptData(transaction.id);
    expect(data?.storeName).toBe('OrderKasir');
    expect(data?.storeAddress).toBeNull();
    expect(data?.footerText).toBeNull();

    const bytes = await service.buildReceiptBytes(transaction.id);
    expect(bytes).not.toBeNull();
    if (!bytes) return;
    expect(containsText(bytes, 'OrderKasir')).toBe(true);
    expect(containsText(bytes, 'Terima kasih')).toBe(true);
  });

  it('buildReceiptBytes menghasilkan ESC/POS dengan divider sesuai lebar & format Rp', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const product = await createProduct(db, { name: 'Beras Pandan Wangi 5kg', sellPrice: 75000 });
    await createSetting(db, 'store_name', 'Toko Budi');
    await createSetting(db, 'receipt_footer', 'Terima kasih');
    await createSetting(db, 'printer_paper_width', '80mm');

    const checkout = new CheckoutService(db, { now: () => FIXED_NOW });
    const result = await checkout.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      items: [{ productId: product.id, qty: 1, unitPrice: 75000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [{ method: 'cash', amount: 75000 }],
      status: 'paid',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const service = new ReceiptService(db, new MockPrinterAdapter());
    const bytes = await service.buildReceiptBytes(result.transaction.id);
    expect(bytes).not.toBeNull();
    if (!bytes) return;
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain('Toko Budi');
    expect(ascii).toContain('INV-20260827-0001');
    expect(ascii).toContain('Sari');
    expect(ascii).toContain('Beras Pandan Wangi 5kg');
    expect(ascii).toContain('Rp 75.000');
    expect(ascii).toContain('Terima kasih');
    expect(ascii).toContain('-'.repeat(48));
  });

  it('58mm default divider 32 karakter', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const product = await createProduct(db);
    const { transaction } = await createTransactionViaCheckout(db, user.id, [product.id]);
    const service = new ReceiptService(db, new MockPrinterAdapter());
    const bytes = await service.buildReceiptBytes(transaction.id);
    expect(bytesToAscii(bytes as Uint8Array)).toContain('-'.repeat(32));
  });

  it('buildShareText selalu tersedia (digital fallback) & mengandung semua field PRD §5.3', async () => {
    const db = makeDb();
    const user = await createUser(db, { name: 'Budi' });
    await createSetting(db, 'store_name', JSON.stringify('Warung Bu Sari'));
    await createSetting(db, 'store_address', JSON.stringify('Jl. Kebon Jeruk 5'));
    await createSetting(db, 'receipt_footer', JSON.stringify('Barang tidak dapat ditukar'));

    const p = await createProduct(db, { name: 'Gula 1kg', sellPrice: 15000 });
    const checkout = new CheckoutService(db, { now: () => FIXED_NOW });
    const result = await checkout.checkout({
      shiftId: 'shift-1',
      userId: user.id,
      items: [{ productId: p.id, qty: 2, unitPrice: 15000, discount: 1000 }],
      transactionDiscount: 500,
      tax: 0,
      payments: [
        { method: 'cash', amount: 15000 },
        { method: 'qris', amount: 13500, reference: 'QR-123' },
      ],
      status: 'paid',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const service = new ReceiptService(db, new MockPrinterAdapter());
    const text = await service.buildShareText(result.transaction.id);
    expect(text).not.toBeNull();
    if (!text) return;
    expect(text).toContain('Warung Bu Sari');
    expect(text).toContain('Jl. Kebon Jeruk 5');
    expect(text).toContain('INV-20260827-0001');
    expect(text).toContain('Budi');
    expect(text).toContain('Gula 1kg');
    expect(text).toContain('Rp');
    expect(text).toContain('Tunai');
    expect(text).toContain('QRIS');
    expect(text).toContain('QR-123');
    expect(text).toContain('Barang tidak dapat ditukar');
  });

  it('snapshot: nama & unit snapshot tetap dipakai meski produk diubah/hapus', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const product = await createProduct(db, { name: 'Nama Lama Produk', sellPrice: 10000 });
    const { transaction } = await createTransactionViaCheckout(db, user.id, [product.id]);

    await db.write(async () => {
      await product.update((r) => {
        r.name = 'Nama Baru Produk';
      });
    });

    const service = new ReceiptService(db, new MockPrinterAdapter());
    const data = await service.getReceiptData(transaction.id);
    expect(data?.items[0].name).toBe('Nama Lama Produk');
    const bytes = await service.buildReceiptBytes(transaction.id);
    expect(containsText(bytes as Uint8Array, 'Nama Lama Produk')).toBe(true);
    expect(containsText(bytes as Uint8Array, 'Nama Baru Produk')).toBe(false);
  });

  it('printReceipt sukses bila terhubung & hormati copyCount', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const product = await createProduct(db);
    await createSetting(db, 'printer_copy_count', JSON.stringify('2'));
    await createSetting(db, 'printer_paper_width', JSON.stringify('58mm'));
    await createSetting(db, 'printer_default_address', JSON.stringify('00:11:22:33:44:58'));

    const { transaction } = await createTransactionViaCheckout(db, user.id, [product.id]);
    const adapter = new MockPrinterAdapter();
    const service = new ReceiptService(db, adapter);

    const result = await service.printReceipt(transaction.id);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.copies).toBe(2);
    expect(adapter.getPrintedBuffers()).toHaveLength(2);
    expect(containsText(adapter.getLastPrinted() as Uint8Array, transaction.invoiceNo)).toBe(true);
  });

  it('printReceipt auto-connect ke default bila belum terhubung', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const product = await createProduct(db);
    await createSetting(db, 'printer_default_address', JSON.stringify('00:11:22:33:44:58'));
    const { transaction } = await createTransactionViaCheckout(db, user.id, [product.id]);
    const adapter = new MockPrinterAdapter();
    const service = new ReceiptService(db, adapter);
    expect(await adapter.isConnected()).toBe(false);
    const result = await service.printReceipt(transaction.id);
    expect(result.status).toBe('ok');
    expect(await adapter.isConnected()).toBe(true);
  });

  it('printReceipt gagal dengan pesan actionable bila tidak ada printer & tidak terhubung', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const product = await createProduct(db);
    const { transaction } = await createTransactionViaCheckout(db, user.id, [product.id]);
    const service = new ReceiptService(db, new MockPrinterAdapter());
    const result = await service.printReceipt(transaction.id);
    expect(result).toMatchObject({ status: 'error', message: PRINTER_ERROR_MESSAGE });
    if (result.status === 'error') {
      expect(result.code).toBe('not_connected');
    }
    const text = await service.buildShareText(transaction.id);
    expect(text).not.toBeNull();
    expect(text).toContain('INV-');
  });

  it('printReceipt mengembalikan not_found untuk transactionId asing', async () => {
    const db = makeDb();
    const service = new ReceiptService(db, new MockPrinterAdapter());
    const result = await service.printReceipt('tidak-ada');
    expect(result).toEqual({ status: 'not_found', transactionId: 'tidak-ada' });
    expect(await service.buildShareText('tidak-ada')).toBeNull();
    expect(await service.buildReceiptBytes('tidak-ada')).toBeNull();
  });

  it('retry: fail next print lalu sukses pada percobaan kedua', async () => {
    const db = makeDb();
    const user = await createUser(db);
    const product = await createProduct(db);
    await createSetting(db, 'printer_default_address', JSON.stringify('00:11:22:33:44:58'));
    const { transaction } = await createTransactionViaCheckout(db, user.id, [product.id]);
    const adapter = new MockPrinterAdapter();
    const service = new ReceiptService(db, adapter);
    adapter.setFailNextPrint(true);
    const first = await service.printReceipt(transaction.id);
    expect(first).toMatchObject({ status: 'error', code: 'write_failed' });
    const second = await service.printReceipt(transaction.id);
    expect(second.status).toBe('ok');
  });
});
