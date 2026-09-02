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
import { ShiftService } from '../ShiftService';

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

type TestHarness = {
  db: Database;
  service: ShiftService;
  now: () => number;
  advanceMs: (ms: number) => void;
};

const FIXED_NOW = new Date(2026, 7, 27, 8, 0, 0).getTime();

const makeHarness = (): TestHarness => {
  const db = makeDb();
  let currentTime = FIXED_NOW;
  const service = new ShiftService(db, { now: () => currentTime });
  return {
    db,
    service,
    now: () => currentTime,
    advanceMs: (ms: number) => {
      currentTime += ms;
    },
  };
};

const createUser = async (db: Database, overrides: Partial<{ name: string; role: 'admin' | 'kasir'; isActive: boolean }> = {}): Promise<User> => {
  const { name = 'Budi', role = 'kasir', isActive = true } = overrides;
  let created: User | undefined;
  await db.write(async () => {
    created = await db.get<User>('users').create((raw) => {
      raw.name = name;
      raw.pinHash = 'plain$1234';
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

const createTransactionWithPayment = async (
  db: Database,
  input: {
    shiftId: string;
    userId: string;
    status?: 'paid' | 'void' | 'debt';
    total: number;
    payments: Array<{ method: 'cash' | 'qris' | 'debit' | 'transfer'; amount: number }>;
  },
): Promise<Transaction> => {
  const { shiftId, userId, status = 'paid', total, payments } = input;
  let trx: Transaction | undefined;
  const timestamp = Date.now();
  await db.write(async () => {
    trx = await db.get<Transaction>('transactions').create((raw) => {
      raw.invoiceNo = `INV-20260827-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      raw.shiftId = shiftId;
      raw.userId = userId;
      raw.customerId = null;
      raw.subtotal = total;
      raw.discount = 0;
      raw.tax = 0;
      raw.total = total;
      raw.status = status;
      raw.voidReason = null;
      raw.voidByUserId = null;
      raw.createdAt = timestamp;
      raw.updatedAt = timestamp;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', timestamp);
    });
    for (const payment of payments) {
      await db.get<Payment>('payments').create((raw) => {
        raw.transactionId = trx!.id;
        raw.method = payment.method;
        raw.amount = payment.amount;
        raw.reference = null;
        raw.createdAt = timestamp;
        raw.updatedAt = timestamp;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', timestamp);
      });
    }
  });
  if (!trx) throw new Error('gagal membuat transaksi uji');
  return trx;
};

const createDebtPayment = async (
  db: Database,
  input: {
    shiftId: string;
    userId: string;
    method: 'cash' | 'qris' | 'debit' | 'transfer';
    amount: number;
  },
): Promise<DebtPayment> => {
  const { shiftId, userId, method, amount } = input;
  let debt: Debt | undefined;
  let payment: DebtPayment | undefined;
  const timestamp = Date.now();
  await db.write(async () => {
    // buat debt dummy minimal agar FK valid secara logika
    debt = await db.get<Debt>('debts').create((raw) => {
      raw.transactionId = `trx-${Math.random().toString(36).slice(2)}`;
      raw.customerId = `cust-${Math.random().toString(36).slice(2)}`;
      raw.totalAmount = amount;
      raw.paidAmount = amount;
      raw.dueDate = null;
      raw.status = 'paid';
      raw.createdAt = timestamp;
      raw.updatedAt = timestamp;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', timestamp);
    });
    payment = await db.get<DebtPayment>('debt_payments').create((raw) => {
      raw.debtId = debt!.id;
      raw.amount = amount;
      raw.method = method;
      raw.reference = null;
      raw.userId = userId;
      raw.shiftId = shiftId;
      raw.paidAt = timestamp;
      raw.createdAt = timestamp;
      raw.updatedAt = timestamp;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', timestamp);
    });
  });
  if (!payment) throw new Error('gagal membuat debt_payment uji');
  return payment;
};

describe('ShiftService - openShift (T3.1)', () => {
  it('membuka shift dengan modal awal dan status open', async () => {
    const h = makeHarness();
    const u = await createUser(h.db);
    const result = await h.service.openShift({ userId: u.id, openingCash: 100_000 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.shift.userId).toBe(u.id);
    expect(result.shift.openingCash).toBe(100_000);
    expect(result.shift.openedAt).toBe(h.now());
    expect(result.shift.closedAt).toBeNull();
    expect(result.shift.closingCash).toBeNull();
    expect(result.shift.expectedCash).toBeNull();
    expect(result.shift.difference).toBeNull();
    expect(result.shift.status).toBe('open');
    expect(result.shift._getRaw('deleted')).toBe(false);
    expect(typeof result.shift._getRaw('last_modified')).toBe('number');
  });

  it('hanya satu shift aktif per device', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const first = await h.service.openShift({ userId: user.id, openingCash: 50_000 });
    expect(first.status).toBe('ok');

    const second = await h.service.openShift({ userId: user.id, openingCash: 20_000 });
    expect(second).toEqual({
      status: 'active_shift_exists',
      activeShiftId: (first as { shift: Shift }).shift.id,
    });

    const active = await h.service.getActiveShift();
    expect(active?.id).toBe((first as { shift: Shift }).shift.id);
  });

  it('setelah tutup, boleh buka shift baru', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const first = await h.service.openShift({ userId: user.id, openingCash: 50_000 });
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;

    const closed = await h.service.closeShift({ shiftId: first.shift.id, closingCash: 50_000 });
    expect(closed.status).toBe('ok');

    const activeAfterClose = await h.service.getActiveShift();
    expect(activeAfterClose).toBeNull();

    const second = await h.service.openShift({ userId: user.id, openingCash: 30_000 });
    expect(second.status).toBe('ok');
  });

  it('validasi openingCash harus integer >=0', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    expect(await h.service.openShift({ userId: user.id, openingCash: -1 })).toEqual({
      status: 'invalid_opening_cash',
    });
    expect(await h.service.openShift({ userId: user.id, openingCash: 12.5 })).toEqual({
      status: 'invalid_opening_cash',
    });
    expect(await h.service.openShift({ userId: user.id, openingCash: NaN })).toEqual({
      status: 'invalid_opening_cash',
    });
  });

  it('user tidak ditemukan atau tidak aktif ditolak', async () => {
    const h = makeHarness();
    const inactive = await createUser(h.db, { isActive: false });
    expect(await h.service.openShift({ userId: inactive.id, openingCash: 10_000 })).toEqual({
      status: 'user_not_found',
      userId: inactive.id,
    });
    expect(await h.service.openShift({ userId: 'tidak-ada', openingCash: 10_000 })).toEqual({
      status: 'user_not_found',
      userId: 'tidak-ada',
    });
  });
});

describe('ShiftService - expected_cash formula (T3.1)', () => {
  it.each([
    {
      name: 'hanya modal awal tanpa transaksi',
      openingCash: 100_000,
      cashSales: [] as number[],
      cashDebtPayments: [] as number[],
      drawerPulls: [] as number[],
      closingCash: 100_000,
      expectedDiff: 0,
    },
    {
      name: 'modal + penjualan tunai',
      openingCash: 50_000,
      cashSales: [20_000, 15_000],
      cashDebtPayments: [],
      drawerPulls: [],
      closingCash: 85_000,
      expectedDiff: 0,
    },
    {
      name: 'modal + penjualan tunai + pelunasan bon tunai',
      openingCash: 50_000,
      cashSales: [30_000],
      cashDebtPayments: [25_000, 10_000],
      drawerPulls: [],
      closingCash: 115_000,
      expectedDiff: 0,
    },
    {
      name: 'modal + penjualan tunai + pelunasan bon - drawer pull (selisih 0)',
      openingCash: 100_000,
      cashSales: [40_000],
      cashDebtPayments: [20_000],
      drawerPulls: [30_000, 10_000],
      closingCash: 120_000,
      expectedDiff: 0,
    },
    {
      name: 'selisih positif dan negatif',
      openingCash: 100_000,
      cashSales: [50_000],
      cashDebtPayments: [],
      drawerPulls: [20_000],
      closingCash: 140_000,
      expectedDiff: 10_000,
    },
  ])('formula: $name', async ({ openingCash, cashSales, cashDebtPayments, drawerPulls, closingCash, expectedDiff }) => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const opened = await h.service.openShift({ userId: user.id, openingCash });
    expect(opened.status).toBe('ok');
    if (opened.status !== 'ok') return;
    const shiftId = opened.shift.id;

    for (const amount of cashSales) {
      await createTransactionWithPayment(h.db, {
        shiftId,
        userId: user.id,
        total: amount,
        payments: [{ method: 'cash', amount }],
      });
    }

    for (const amount of cashDebtPayments) {
      await createDebtPayment(h.db, { shiftId, userId: user.id, method: 'cash', amount });
    }

    for (const amount of drawerPulls) {
      const pull = await h.service.recordDrawerPull({
        shiftId,
        amount,
        userId: user.id,
        reason: 'Setor ke brankas',
      });
      expect(pull.status).toBe('ok');
    }

    const expectedCash = openingCash + cashSales.reduce((a, b) => a + b, 0) + cashDebtPayments.reduce((a, b) => a + b, 0) - drawerPulls.reduce((a, b) => a + b, 0);
    const computed = await h.service.computeExpectedCash(shiftId);
    expect(computed).toBe(expectedCash);

    const closed = await h.service.closeShift({ shiftId, closingCash });
    expect(closed.status).toBe('ok');
    if (closed.status !== 'ok') return;
    expect(closed.expectedCash).toBe(expectedCash);
    expect(closed.difference).toBe(expectedDiff);
    expect(closed.shift.expectedCash).toBe(expectedCash);
    expect(closed.shift.difference).toBe(expectedDiff);
    expect(closed.shift.status).toBe('closed');
    expect(closed.shift.closedAt).toBe(h.now());
    expect(closed.shift.closingCash).toBe(closingCash);
  });

  it('cash sales hanya menghitung method cash dan bukan void', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const opened = await h.service.openShift({ userId: user.id, openingCash: 100_000 });
    if (opened.status !== 'ok') throw new Error('open gagal');
    const shiftId = opened.shift.id;

    await createTransactionWithPayment(h.db, {
      shiftId,
      userId: user.id,
      total: 20_000,
      payments: [{ method: 'cash', amount: 20_000 }],
    });
    await createTransactionWithPayment(h.db, {
      shiftId,
      userId: user.id,
      total: 30_000,
      payments: [{ method: 'qris', amount: 30_000 }],
    });
    await createTransactionWithPayment(h.db, {
      shiftId,
      userId: user.id,
      status: 'void',
      total: 50_000,
      payments: [{ method: 'cash', amount: 50_000 }],
    });

    const computed = await h.service.computeExpectedCash(shiftId);
    expect(computed).toBe(100_000 + 20_000);
  });

  it('pelunasan bon hanya menghitung method cash', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const opened = await h.service.openShift({ userId: user.id, openingCash: 50_000 });
    if (opened.status !== 'ok') throw new Error('open gagal');
    const shiftId = opened.shift.id;

    await createDebtPayment(h.db, { shiftId, userId: user.id, method: 'cash', amount: 15_000 });
    await createDebtPayment(h.db, { shiftId, userId: user.id, method: 'transfer', amount: 100_000 });

    const computed = await h.service.computeExpectedCash(shiftId);
    expect(computed).toBe(65_000);
  });

  it('drawer pull hanya untuk shift tersebut', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const shiftA = await h.service.openShift({ userId: user.id, openingCash: 100_000 });
    if (shiftA.status !== 'ok') throw new Error('open A gagal');
    await h.service.recordDrawerPull({ shiftId: shiftA.shift.id, amount: 20_000, userId: user.id });
    await h.service.closeShift({ shiftId: shiftA.shift.id, closingCash: 80_000 });

    const shiftB = await h.service.openShift({ userId: user.id, openingCash: 50_000 });
    if (shiftB.status !== 'ok') throw new Error('open B gagal');
    // drawer pull A tidak boleh memengaruhi B
    const computedB = await h.service.computeExpectedCash(shiftB.shift.id);
    expect(computedB).toBe(50_000);

    await createTransactionWithPayment(h.db, {
      shiftId: shiftB.shift.id,
      userId: user.id,
      total: 10_000,
      payments: [{ method: 'cash', amount: 10_000 }],
    });
    expect(await h.service.computeExpectedCash(shiftB.shift.id)).toBe(60_000);
  });

  it('expected_cash tetap benar walau transaksi shift lain ada', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const s1 = await h.service.openShift({ userId: user.id, openingCash: 10_000 });
    if (s1.status !== 'ok') throw new Error('s1 gagal');
    await createTransactionWithPayment(h.db, {
      shiftId: s1.shift.id,
      userId: user.id,
      total: 5_000,
      payments: [{ method: 'cash', amount: 5_000 }],
    });
    await h.service.closeShift({ shiftId: s1.shift.id, closingCash: 15_000 });

    const s2 = await h.service.openShift({ userId: user.id, openingCash: 20_000 });
    if (s2.status !== 'ok') throw new Error('s2 gagal');
    // transaksi s1 tidak ikut terhitung di s2
    expect(await h.service.computeExpectedCash(s2.shift.id)).toBe(20_000);
  });
});

describe('ShiftService - closeShift & drawer pull validasi', () => {
  it('close validasi closingCash dan shift state', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const opened = await h.service.openShift({ userId: user.id, openingCash: 10_000 });
    if (opened.status !== 'ok') throw new Error('open gagal');
    const shiftId = opened.shift.id;

    expect(await h.service.closeShift({ shiftId, closingCash: -5 })).toEqual({
      status: 'invalid_closing_cash',
    });
    expect(await h.service.closeShift({ shiftId: 'tidak-ada', closingCash: 10_000 })).toEqual({
      status: 'shift_not_found',
      shiftId: 'tidak-ada',
    });

    const firstClose = await h.service.closeShift({ shiftId, closingCash: 10_000 });
    expect(firstClose.status).toBe('ok');

    expect(await h.service.closeShift({ shiftId, closingCash: 10_000 })).toEqual({
      status: 'shift_already_closed',
      shiftId,
    });
  });

  it('recordDrawerPull validasi amount dan shift status', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const opened = await h.service.openShift({ userId: user.id, openingCash: 50_000 });
    if (opened.status !== 'ok') throw new Error('open gagal');
    const shiftId = opened.shift.id;

    expect(await h.service.recordDrawerPull({ shiftId, amount: 0, userId: user.id })).toEqual({
      status: 'invalid_amount',
    });
    expect(await h.service.recordDrawerPull({ shiftId, amount: -100, userId: user.id })).toEqual({
      status: 'invalid_amount',
    });
    expect(await h.service.recordDrawerPull({ shiftId: 'tidak-ada', amount: 10_000, userId: user.id })).toEqual({
      status: 'shift_not_found',
      shiftId: 'tidak-ada',
    });
    expect(await h.service.recordDrawerPull({ shiftId, amount: 10_000, userId: 'user-hantu' })).toEqual({
      status: 'user_not_found',
      userId: 'user-hantu',
    });

    await h.service.closeShift({ shiftId, closingCash: 50_000 });
    expect(await h.service.recordDrawerPull({ shiftId, amount: 5_000, userId: user.id })).toEqual({
      status: 'shift_already_closed',
      shiftId,
    });
  });

  it('drawer pull tercatat sebagai movement dengan audit trail', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const opened = await h.service.openShift({ userId: user.id, openingCash: 100_000 });
    if (opened.status !== 'ok') throw new Error('open gagal');
    const shiftId = opened.shift.id;

    const result = await h.service.recordDrawerPull({
      shiftId,
      amount: 25_000,
      userId: user.id,
      reason: 'Ambil untuk belanja',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.pull.shiftId).toBe(shiftId);
    expect(result.pull.amount).toBe(25_000);
    expect(result.pull.reason).toBe('Ambil untuk belanja');
    expect(result.pull.userId).toBe(user.id);
    expect(result.pull._getRaw('deleted')).toBe(false);

    const computed = await h.service.computeExpectedCash(shiftId);
    expect(computed).toBe(75_000);
  });

  it('selisih = closingCash - expectedCash (negatif dan positif)', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);

    const shift = await h.service.openShift({ userId: user.id, openingCash: 100_000 });
    if (shift.status !== 'ok') throw new Error('open gagal');
    await createTransactionWithPayment(h.db, {
      shiftId: shift.shift.id,
      userId: user.id,
      total: 20_000,
      payments: [{ method: 'cash', amount: 20_000 }],
    });

    // expected = 120_000
    const kurang = await h.service.closeShift({ shiftId: shift.shift.id, closingCash: 110_000 });
    expect(kurang.status).toBe('ok');
    if (kurang.status !== 'ok') return;
    expect(kurang.expectedCash).toBe(120_000);
    expect(kurang.difference).toBe(-10_000);

    // buka shift baru untuk selisih positif
    const shift2 = await h.service.openShift({ userId: user.id, openingCash: 50_000 });
    if (shift2.status !== 'ok') throw new Error('open2 gagal');
    const lebih = await h.service.closeShift({ shiftId: shift2.shift.id, closingCash: 60_000 });
    expect(lebih.status).toBe('ok');
    if (lebih.status !== 'ok') return;
    expect(lebih.expectedCash).toBe(50_000);
    expect(lebih.difference).toBe(10_000);
  });

  it('soft-delete shift tidak dianggap aktif', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const opened = await h.service.openShift({ userId: user.id, openingCash: 10_000 });
    if (opened.status !== 'ok') throw new Error('open gagal');
    // soft delete via direct write
    await h.db.write(async () => {
      await opened.shift.update((raw) => {
        raw._setRaw('deleted', true);
      });
    });
    const active = await h.service.getActiveShift();
    expect(active).toBeNull();

    // setelah soft-delete, boleh buka shift baru
    const second = await h.service.openShift({ userId: user.id, openingCash: 5_000 });
    expect(second.status).toBe('ok');
  });
});
