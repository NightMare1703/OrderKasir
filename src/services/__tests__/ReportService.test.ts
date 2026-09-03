import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';
import dayjs from 'dayjs';

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
import { PROFIT_LABEL, ReportService } from '../ReportService';

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

const FIXED_NOW = new Date(2026, 7, 27, 12, 0, 0).getTime();

const makeHarness = () => {
  const db = makeDb();
  let currentTime = FIXED_NOW;
  const service = new ReportService(db, { now: () => currentTime });
  return {
    db,
    service,
    now: () => currentTime,
    setNow: (value: number) => {
      currentTime = value;
    },
  };
};

const createCategory = async (db: Database, name: string): Promise<Category> => {
  let created: Category | undefined;
  const ts = Date.now();
  await db.write(async () => {
    created = await db.get<Category>('categories').create((raw) => {
      raw.name = name;
      raw.createdAt = ts;
      raw.updatedAt = ts;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', ts);
    });
  });
  if (!created) throw new Error('gagal membuat kategori uji');
  return created;
};

const createProduct = async (
  db: Database,
  overrides: Partial<{
    name: string;
    categoryId: string | null;
    costPrice: number;
    sellPrice: number;
    stock: number;
    minStock: number;
  }> = {},
): Promise<Product> => {
  const {
    name = `Produk ${Math.random().toString(36).slice(2, 4)}`,
    categoryId = null,
    costPrice = 5_000,
    sellPrice = 8_000,
    stock = 10,
    minStock = 5,
  } = overrides;
  let created: Product | undefined;
  const ts = Date.now();
  await db.write(async () => {
    created = await db.get<Product>('products').create((raw) => {
      raw.name = name;
      raw.barcode = null;
      raw.categoryId = categoryId;
      raw.unit = 'pcs';
      raw.customUnitLabel = null;
      raw.costPrice = costPrice;
      raw.sellPrice = sellPrice;
      raw.stock = stock;
      raw.minStock = minStock;
      raw.isActive = true;
      raw.createdAt = ts;
      raw.updatedAt = ts;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', ts);
    });
  });
  if (!created) throw new Error('gagal membuat produk uji');
  return created;
};

const createTransactionWithItems = async (
  db: Database,
  input: {
    createdAt: number;
    status: 'paid' | 'void' | 'debt';
    total: number;
    discount?: number;
    tax?: number;
    items: Array<{ product: Product; qty: number; unitPrice: number; discount?: number }>;
    payments?: Array<{ method: 'cash' | 'qris' | 'debit' | 'transfer'; amount: number }>;
  },
): Promise<Transaction> => {
  const { createdAt, status, total, discount = 0, tax = 0, items, payments = [] } = input;
  let trx: Transaction | undefined;
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  await db.write(async () => {
    trx = await db.get<Transaction>('transactions').create((raw) => {
      raw.invoiceNo = `INV-${dayjs(createdAt).format('YYYYMMDD')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      raw.shiftId = 'shift-1';
      raw.userId = 'user-1';
      raw.customerId = null;
      raw.subtotal = subtotal;
      raw.discount = discount;
      raw.tax = tax;
      raw.total = total;
      raw.status = status;
      raw.voidReason = null;
      raw.voidByUserId = null;
      raw.createdAt = createdAt;
      raw.updatedAt = createdAt;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', createdAt);
    });
    for (const item of items) {
      await db.get<TransactionItem>('transaction_items').create((raw) => {
        raw.transactionId = trx!.id;
        raw.productId = item.product.id;
        raw.productNameSnapshot = item.product.name;
        raw.unitSnapshot = 'pcs';
        raw.qty = item.qty;
        raw.unitPrice = item.unitPrice;
        raw.discount = item.discount ?? 0;
        raw.total = item.qty * item.unitPrice - (item.discount ?? 0);
        raw.createdAt = createdAt;
        raw.updatedAt = createdAt;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', createdAt);
      });
    }
    for (const payment of payments) {
      await db.get<Payment>('payments').create((raw) => {
        raw.transactionId = trx!.id;
        raw.method = payment.method;
        raw.amount = payment.amount;
        raw.reference = null;
        raw.createdAt = createdAt;
        raw.updatedAt = createdAt;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', createdAt);
      });
    }
  });
  if (!trx) throw new Error('gagal membuat transaksi uji');
  return trx;
};

const createCustomer = async (db: Database, name: string): Promise<Customer> => {
  let created: Customer | undefined;
  const ts = Date.now();
  await db.write(async () => {
    created = await db.get<Customer>('customers').create((raw) => {
      raw.name = name;
      raw.phone = null;
      raw.note = null;
      raw.debtLimit = null;
      raw.createdAt = ts;
      raw.updatedAt = ts;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', ts);
    });
  });
  if (!created) throw new Error('gagal membuat customer uji');
  return created;
};

const createDebt = async (
  db: Database,
  input: {
    customerId: string;
    totalAmount: number;
    paidAmount?: number;
    status: 'open' | 'partial' | 'paid';
    dueDate: number | null;
  },
): Promise<Debt> => {
  let created: Debt | undefined;
  const ts = Date.now();
  await db.write(async () => {
    created = await db.get<Debt>('debts').create((raw) => {
      raw.transactionId = `trx-${Math.random().toString(36).slice(2, 6)}`;
      raw.customerId = input.customerId;
      raw.totalAmount = input.totalAmount;
      raw.paidAmount = input.paidAmount ?? 0;
      raw.dueDate = input.dueDate;
      raw.status = input.status;
      raw.createdAt = ts;
      raw.updatedAt = ts;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', ts);
    });
  });
  if (!created) throw new Error('gagal membuat debt uji');
  return created;
};

describe('ReportService - dataset sintetis T3.5', () => {
  const day = (offsetDays: number): number => dayjs(FIXED_NOW).add(offsetDays, 'day').valueOf();
  const rangeAll = { start: day(-10), end: day(10) };
  const rangeToday = {
    start: dayjs(FIXED_NOW).startOf('day').valueOf(),
    end: dayjs(FIXED_NOW).endOf('day').valueOf(),
  };

  it('label laba kotor tetap "laba kotor estimasi"', async () => {
    const h = makeHarness();
    expect(PROFIT_LABEL).toBe('laba kotor estimasi');
    const report = await h.service.getProfitReport(rangeAll);
    expect(report.label).toBe('laba kotor estimasi');
  });

  it.each([
    {
      name: 'omzet & rata-rata basket dari snapshot transaksi (void & deleted tidak ikut)',
      transactions: async (db: Database, products: Product[]) => {
        const t1 = day(0) + 1000;
        const t2 = day(0) + 2000;
        const tOutside = day(-20);
        // valid: 2 transaksi hari ini
        await createTransactionWithItems(db, {
          createdAt: t1,
          status: 'paid',
          total: 25_000,
          items: [{ product: products[0], qty: 2, unitPrice: 10_000, discount: 0 }],
          payments: [{ method: 'cash', amount: 25_000 }],
        });
        // total = item total 20_000 - discount transaksi? kita set total langsung 25_000 untuk cek
        await createTransactionWithItems(db, {
          createdAt: t2,
          status: 'paid',
          total: 15_000,
          items: [{ product: products[1], qty: 1, unitPrice: 15_000, discount: 0 }],
          payments: [{ method: 'qris', amount: 15_000 }],
        });
        // void harus diabaikan
        await createTransactionWithItems(db, {
          createdAt: t1,
          status: 'void',
          total: 99_999,
          items: [{ product: products[0], qty: 10, unitPrice: 10_000, discount: 0 }],
          payments: [{ method: 'cash', amount: 99_999 }],
        });
        // di luar range harus diabaikan
        await createTransactionWithItems(db, {
          createdAt: tOutside,
          status: 'paid',
          total: 50_000,
          items: [{ product: products[0], qty: 5, unitPrice: 10_000, discount: 0 }],
          payments: [{ method: 'cash', amount: 50_000 }],
        });
        // soft-deleted transaction harus diabaikan
        const deletedTrx = await createTransactionWithItems(db, {
          createdAt: t1,
          status: 'paid',
          total: 77_000,
          items: [{ product: products[0], qty: 1, unitPrice: 77_000, discount: 0 }],
          payments: [{ method: 'cash', amount: 77_000 }],
        });
        await db.write(async () => {
          await deletedTrx.update((raw) => raw._setRaw('deleted', true));
        });
      },
      expected: { omzet: 40_000, transactionCount: 2, averageBasket: 20_000 },
    },
  ])('sales report: $name', async ({ transactions, expected }) => {
    const h = makeHarness();
    const pA = await createProduct(h.db, { name: 'Indomie Goreng', costPrice: 5_000, sellPrice: 10_000, stock: 100 });
    const pB = await createProduct(h.db, { name: 'Teh Pucuk 350ml', costPrice: 3_000, sellPrice: 15_000, stock: 100 });
    await transactions(h.db, [pA, pB]);
    const report = await h.service.getSalesReport(rangeToday);
    expect(report.omzet).toBe(expected.omzet);
    expect(report.transactionCount).toBe(expected.transactionCount);
    expect(report.averageBasket).toBe(expected.averageBasket);
  });

  it('breakdown metode pembayaran dari snapshot payments (hanya transaksi dalam range & non-void)', async () => {
    const h = makeHarness();
    const p = await createProduct(h.db, { name: 'Kopi ABC', costPrice: 2_000, sellPrice: 5_000, stock: 100 });
    const t1 = day(0) + 1000;
    const t2 = day(0) + 2000;
    await createTransactionWithItems(h.db, {
      createdAt: t1,
      status: 'paid',
      total: 10_000,
      items: [{ product: p, qty: 2, unitPrice: 5_000, discount: 0 }],
      payments: [
        { method: 'cash', amount: 6_000 },
        { method: 'qris', amount: 4_000 },
      ],
    });
    await createTransactionWithItems(h.db, {
      createdAt: t2,
      status: 'paid',
      total: 5_000,
      items: [{ product: p, qty: 1, unitPrice: 5_000, discount: 0 }],
      payments: [{ method: 'debit', amount: 5_000 }],
    });
    await createTransactionWithItems(h.db, {
      createdAt: t1,
      status: 'void',
      total: 20_000,
      items: [{ product: p, qty: 4, unitPrice: 5_000, discount: 0 }],
      payments: [{ method: 'cash', amount: 20_000 }],
    });

    const breakdown = await h.service.getPaymentBreakdown(rangeToday);
    expect(breakdown.cash).toBe(6_000);
    expect(breakdown.qris).toBe(4_000);
    expect(breakdown.debit).toBe(5_000);
    expect(breakdown.transfer).toBe(0);
    expect(breakdown.total).toBe(15_000);
  });

  it('terlaris: agregasi qty & revenue dari snapshot transaction_items', async () => {
    const h = makeHarness();
    const pIndomie = await createProduct(h.db, { name: 'Indomie Goreng', costPrice: 2_500, sellPrice: 3_500, stock: 100 });
    const pTeh = await createProduct(h.db, { name: 'Teh Pucuk 350ml', costPrice: 2_000, sellPrice: 4_000, stock: 100 });
    const pBeras = await createProduct(h.db, { name: 'Beras Pandan Wangi 5kg', costPrice: 50_000, sellPrice: 75_000, stock: 100 });
    const t = day(0) + 1000;
    // Transaksi 1: Indomie 5, Teh 3
    await createTransactionWithItems(h.db, {
      createdAt: t,
      status: 'paid',
      total: 5 * 3_500 + 3 * 4_000,
      items: [
        { product: pIndomie, qty: 5, unitPrice: 3_500, discount: 0 },
        { product: pTeh, qty: 3, unitPrice: 4_000, discount: 0 },
      ],
      payments: [{ method: 'cash', amount: 5 * 3_500 + 3 * 4_000 }],
    });
    // Transaksi 2: Indomie 2, Beras 1
    await createTransactionWithItems(h.db, {
      createdAt: t + 1000,
      status: 'paid',
      total: 2 * 3_500 + 1 * 75_000,
      items: [
        { product: pIndomie, qty: 2, unitPrice: 3_500, discount: 0 },
        { product: pBeras, qty: 1, unitPrice: 75_000, discount: 0 },
      ],
      payments: [{ method: 'cash', amount: 2 * 3_500 + 1 * 75_000 }],
    });

    const top = await h.service.getTopProducts(rangeToday, 10);
    expect(top).toHaveLength(3);
    // Indomie qty 7 terlaris
    expect(top[0].productId).toBe(pIndomie.id);
    expect(top[0].qty).toBe(7);
    expect(top[0].revenue).toBe(7 * 3_500);
    expect(top[0].costEstimate).toBe(7 * 2_500);
    expect(top[0].profitEstimate).toBe(7 * (3_500 - 2_500));
    // Teh qty 3
    expect(top[1].productId).toBe(pTeh.id);
    expect(top[1].qty).toBe(3);
    // Beras qty 1 tapi revenue besar 75_000, urut ketiga karena qty terkecil
    expect(top[2].productId).toBe(pBeras.id);
    expect(top[2].qty).toBe(1);
    expect(top[2].revenue).toBe(75_000);
  });

  it('laba kotor estimasi: omzet - sum(qty*HPP) dengan margin', async () => {
    const h = makeHarness();
    const katMakanan = await createCategory(h.db, 'Makanan');
    const katMinuman = await createCategory(h.db, 'Minuman');
    const pIndomie = await createProduct(h.db, {
      name: 'Indomie Goreng',
      categoryId: katMakanan.id,
      costPrice: 2_500,
      sellPrice: 3_500,
      stock: 100,
    });
    const pTeh = await createProduct(h.db, {
      name: 'Teh Pucuk 350ml',
      categoryId: katMinuman.id,
      costPrice: 2_000,
      sellPrice: 4_000,
      stock: 100,
    });
    const t = day(0) + 1000;
    await createTransactionWithItems(h.db, {
      createdAt: t,
      status: 'paid',
      total: 3 * 3_500 + 2 * 4_000, // 18_500
      discount: 0,
      tax: 0,
      items: [
        { product: pIndomie, qty: 3, unitPrice: 3_500, discount: 0 },
        { product: pTeh, qty: 2, unitPrice: 4_000, discount: 0 },
      ],
      payments: [{ method: 'cash', amount: 18_500 }],
    });
    await createTransactionWithItems(h.db, {
      createdAt: t + 1000,
      status: 'paid',
      total: 1 * 3_500, // 3_500
      items: [{ product: pIndomie, qty: 1, unitPrice: 3_500, discount: 0 }],
      payments: [{ method: 'cash', amount: 3_500 }],
    });

    const report = await h.service.getProfitReport(rangeToday);
    expect(report.label).toBe('laba kotor estimasi');
    // omzet = 22_000
    expect(report.omzet).toBe(22_000);
    // cost = (4 * 2500) + (2 * 2000) = 14_000
    expect(report.costTotalEstimate).toBe(14_000);
    expect(report.grossProfitEstimate).toBe(8_000);
    expect(report.marginPercent).toBeCloseTo(36.36, 1);

    expect(report.perProduct).toHaveLength(2);
    const indomie = report.perProduct.find((p) => p.productId === pIndomie.id);
    expect(indomie?.qty).toBe(4);
    expect(indomie?.revenue).toBe(14_000);
    expect(indomie?.costEstimate).toBe(10_000);
    expect(indomie?.profitEstimate).toBe(4_000);

    expect(report.perCategory).toHaveLength(2);
    const makanan = report.perCategory.find((c) => c.categoryId === katMakanan.id);
    expect(makanan?.revenue).toBe(14_000);
    expect(makanan?.costEstimate).toBe(10_000);
    expect(makanan?.profitEstimate).toBe(4_000);
  });

  it('laba kotor: void & deleted item tidak ikut hitung', async () => {
    const h = makeHarness();
    const p = await createProduct(h.db, { name: 'Indomie Goreng', costPrice: 2_500, sellPrice: 3_500, stock: 100 });
    const t = day(0) + 1000;
    await createTransactionWithItems(h.db, {
      createdAt: t,
      status: 'void',
      total: 100_000,
      items: [{ product: p, qty: 10, unitPrice: 10_000, discount: 0 }],
      payments: [{ method: 'cash', amount: 100_000 }],
    });
    const report = await h.service.getProfitReport(rangeToday);
    expect(report.omzet).toBe(0);
    expect(report.costTotalEstimate).toBe(0);
    expect(report.grossProfitEstimate).toBe(0);
    expect(report.perProduct).toHaveLength(0);
  });

  it('nilai persediaan: stok * HPP, low-stock, kategori', async () => {
    const h = makeHarness();
    const kat = await createCategory(h.db, 'Sembako');
    const pA = await createProduct(h.db, { name: 'Beras 5kg', categoryId: kat.id, costPrice: 50_000, sellPrice: 60_000, stock: 10, minStock: 5 });
    const pB = await createProduct(h.db, { name: 'Gula 1kg', categoryId: kat.id, costPrice: 12_000, sellPrice: 15_000, stock: 2, minStock: 5 });
    const pC = await createProduct(h.db, { name: 'Minyak 2L', categoryId: null, costPrice: 20_000, sellPrice: 25_000, stock: 0, minStock: 3 });
    // soft-deleted product tidak ikut
    const pDeleted = await createProduct(h.db, { name: 'Terhapus', costPrice: 9_999, sellPrice: 9_999, stock: 100, minStock: 1 });
    await h.db.write(async () => {
      await pDeleted.update((raw) => raw._setRaw('deleted', true));
    });
    expect(pA.id).toBeDefined();
    expect(pC.id).toBeDefined();

    const inv = await h.service.getInventoryReport();
    expect(inv.totalValue).toBe(10 * 50_000 + 2 * 12_000 + 0 * 20_000); // 524_000
    expect(inv.totalSku).toBe(3);
    expect(inv.totalUnits).toBe(12);
    expect(inv.lowStockCount).toBe(2); // pB (2<=5) dan pC (0<=3)
    const lowIds = inv.lowStockProducts.map((p) => p.id).sort();
    expect(lowIds).toEqual([pB.id, pC.id].sort());
    expect(inv.categoryValues).toHaveLength(2);
    const sembako = inv.categoryValues.find((c) => c.categoryId === kat.id);
    expect(sembako?.value).toBe(524_000);
    expect(sembako?.skuCount).toBe(2);
    const tanpa = inv.categoryValues.find((c) => c.categoryId === null);
    expect(tanpa?.value).toBe(0);
  });

  it('aging piutang: bucket & perCustomer dari data lokal', async () => {
    const h = makeHarness();
    const custA = await createCustomer(h.db, 'Budi');
    const custB = await createCustomer(h.db, 'Sari');
    const todayStart = dayjs(FIXED_NOW).startOf('day').valueOf();
    const todayEnd = dayjs(FIXED_NOW).endOf('day').valueOf();

    // custA: tanpa dueDate
    await createDebt(h.db, { customerId: custA.id, totalAmount: 50_000, paidAmount: 0, status: 'open', dueDate: null });
    // custA: jatuh tempo hari ini
    await createDebt(h.db, { customerId: custA.id, totalAmount: 30_000, paidAmount: 10_000, status: 'partial', dueDate: todayStart + 1000 });
    // custB: overdue 3 hari
    await createDebt(h.db, { customerId: custB.id, totalAmount: 100_000, paidAmount: 0, status: 'open', dueDate: todayStart - 3 * 24 * 60 * 60 * 1000 });
    // custB: overdue 15 hari
    await createDebt(h.db, { customerId: custB.id, totalAmount: 80_000, paidAmount: 0, status: 'open', dueDate: todayStart - 15 * 24 * 60 * 60 * 1000 });
    // custB: overdue 45 hari
    await createDebt(h.db, { customerId: custB.id, totalAmount: 60_000, paidAmount: 0, status: 'open', dueDate: todayStart - 45 * 24 * 60 * 60 * 1000 });
    // custB: belum jatuh tempo (future)
    await createDebt(h.db, { customerId: custB.id, totalAmount: 40_000, paidAmount: 0, status: 'open', dueDate: todayEnd + 5 * 24 * 60 * 60 * 1000 });
    // paid harus diabaikan
    await createDebt(h.db, { customerId: custA.id, totalAmount: 20_000, paidAmount: 20_000, status: 'paid', dueDate: todayStart });
    // deleted harus diabaikan
    const deletedDebt = await createDebt(h.db, { customerId: custA.id, totalAmount: 99_999, paidAmount: 0, status: 'open', dueDate: todayStart });
    await h.db.write(async () => {
      await deletedDebt.update((raw) => raw._setRaw('deleted', true));
    });

    const aging = await h.service.getDebtAgingReport(FIXED_NOW);
    // totalOutstanding = 50k +20k +100k+80k+60k+40k = 350k (20k is remaining of 30k-10k)
    expect(aging.totalOutstanding).toBe(350_000);
    expect(aging.outstandingCount).toBe(6);

    const byKey = new Map(aging.buckets.map((b) => [b.key, b] as const));
    expect(byKey.get('noDueDate')?.count).toBe(1);
    expect(byKey.get('noDueDate')?.outstanding).toBe(50_000);
    expect(byKey.get('dueToday')?.count).toBe(1);
    expect(byKey.get('dueToday')?.outstanding).toBe(20_000);
    expect(byKey.get('overdue1to7')?.count).toBe(1);
    expect(byKey.get('overdue1to7')?.outstanding).toBe(100_000);
    expect(byKey.get('overdue8to30')?.count).toBe(1);
    expect(byKey.get('overdue8to30')?.outstanding).toBe(80_000);
    expect(byKey.get('overdueOver30')?.count).toBe(1);
    expect(byKey.get('overdueOver30')?.outstanding).toBe(60_000);
    expect(byKey.get('future')?.count).toBe(1);
    expect(byKey.get('future')?.outstanding).toBe(40_000);

    expect(aging.perCustomer).toHaveLength(2);
    // custB outstanding = 100+80+60+40=280k, custA=70k -> custB first
    expect(aging.perCustomer[0].customerId).toBe(custB.id);
    expect(aging.perCustomer[0].outstanding).toBe(280_000);
    expect(aging.perCustomer[0].debtCount).toBe(4);
    expect(aging.perCustomer[1].customerId).toBe(custA.id);
    expect(aging.perCustomer[1].outstanding).toBe(70_000);
  });

  it('range terbalik (start > end) tetap normalisasi', async () => {
    const h = makeHarness();
    const p = await createProduct(h.db, { name: 'Indomie Goreng', costPrice: 5_000, sellPrice: 10_000, stock: 100 });
    const t = day(0) + 1000;
    await createTransactionWithItems(h.db, {
      createdAt: t,
      status: 'paid',
      total: 10_000,
      items: [{ product: p, qty: 1, unitPrice: 10_000, discount: 0 }],
      payments: [{ method: 'cash', amount: 10_000 }],
    });
    const reversed = { start: day(5), end: day(-5) };
    const report = await h.service.getSalesReport(reversed);
    expect(report.transactionCount).toBe(1);
  });

  it('dataset kosong: semua laporan nol tanpa error', async () => {
    const h = makeHarness();
    const sales = await h.service.getSalesReport(rangeToday);
    expect(sales.omzet).toBe(0);
    expect(sales.transactionCount).toBe(0);
    expect(sales.averageBasket).toBe(0);

    const breakdown = await h.service.getPaymentBreakdown(rangeToday);
    expect(breakdown.total).toBe(0);

    const top = await h.service.getTopProducts(rangeToday);
    expect(top).toEqual([]);

    const profit = await h.service.getProfitReport(rangeToday);
    expect(profit.omzet).toBe(0);
    expect(profit.costTotalEstimate).toBe(0);
    expect(profit.grossProfitEstimate).toBe(0);
    expect(profit.marginPercent).toBeNull();

    const inv = await h.service.getInventoryReport();
    expect(inv.totalValue).toBe(0);
    expect(inv.lowStockCount).toBe(0);

    const aging = await h.service.getDebtAgingReport(FIXED_NOW);
    expect(aging.totalOutstanding).toBe(0);
    expect(aging.outstandingCount).toBe(0);
  });
});
