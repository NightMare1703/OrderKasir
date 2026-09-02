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
import { CheckoutService } from '../CheckoutService';
import { DebtService } from '../DebtService';

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
  service: DebtService;
  now: () => number;
  advanceMs: (ms: number) => void;
};

const FIXED_NOW = new Date(2026, 7, 27, 14, 5, 0).getTime();

const makeHarness = (): TestHarness => {
  const db = makeDb();
  let currentTime = FIXED_NOW;
  const service = new DebtService(db, { now: () => currentTime });
  return {
    db,
    service,
    now: () => currentTime,
    advanceMs: (ms: number) => {
      currentTime += ms;
    },
  };
};

const createUser = async (db: Database, overrides: Partial<{ role: 'admin' | 'kasir'; isActive: boolean }> = {}): Promise<User> => {
  const { role = 'kasir', isActive = true } = overrides;
  let created: User | undefined;
  await db.write(async () => {
    created = await db.get<User>('users').create((raw) => {
      raw.name = 'Budi';
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

const createCustomer = async (
  db: Database,
  overrides: Partial<{ name: string; debtLimit: number | null }> = {},
): Promise<Customer> => {
  const { name = 'Pelanggan A', debtLimit = null } = overrides;
  let created: Customer | undefined;
  await db.write(async () => {
    created = await db.get<Customer>('customers').create((raw) => {
      raw.name = name;
      raw.phone = null;
      raw.note = null;
      raw.debtLimit = debtLimit;
      raw.createdAt = 1;
      raw.updatedAt = 1;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', 1);
    });
  });
  if (!created) throw new Error('gagal membuat customer uji');
  return created;
};

const createShift = async (db: Database, userId: string): Promise<Shift> => {
  let created: Shift | undefined;
  const ts = Date.now();
  await db.write(async () => {
    created = await db.get<Shift>('shifts').create((raw) => {
      raw.userId = userId;
      raw.openedAt = ts;
      raw.closedAt = null;
      raw.openingCash = 100_000;
      raw.closingCash = null;
      raw.expectedCash = null;
      raw.difference = null;
      raw.status = 'open';
      raw.notes = null;
      raw.createdAt = ts;
      raw.updatedAt = ts;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', ts);
    });
  });
  if (!created) throw new Error('gagal membuat shift uji');
  return created;
};

const createTransaction = async (
  db: Database,
  input: { userId: string; shiftId: string; customerId: string | null; status: 'paid' | 'debt'; total: number },
): Promise<Transaction> => {
  let created: Transaction | undefined;
  const ts = Date.now();
  await db.write(async () => {
    created = await db.get<Transaction>('transactions').create((raw) => {
      raw.invoiceNo = `INV-20260827-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      raw.shiftId = input.shiftId;
      raw.userId = input.userId;
      raw.customerId = input.customerId;
      raw.subtotal = input.total;
      raw.discount = 0;
      raw.tax = 0;
      raw.total = input.total;
      raw.status = input.status;
      raw.voidReason = null;
      raw.voidByUserId = null;
      raw.createdAt = ts;
      raw.updatedAt = ts;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', ts);
    });
  });
  if (!created) throw new Error('gagal membuat transaction uji');
  return created;
};

const createProduct = async (db: Database, overrides: Partial<{ stock: number; sellPrice: number }> = {}): Promise<Product> => {
  const { stock = 50, sellPrice = 10_000 } = overrides;
  let created: Product | undefined;
  await db.write(async () => {
    created = await db.get<Product>('products').create((raw) => {
      raw.name = `Produk ${Math.random().toString(36).slice(2, 4)}`;
      raw.barcode = null;
      raw.categoryId = null;
      raw.unit = 'pcs';
      raw.customUnitLabel = null;
      raw.costPrice = 5_000;
      raw.sellPrice = sellPrice;
      raw.stock = stock;
      raw.minStock = 5;
      raw.isActive = true;
      raw.createdAt = 1;
      raw.updatedAt = 1;
      raw._setRaw('deleted', false);
      raw._setRaw('last_modified', 1);
    });
  });
  if (!created) throw new Error('gagal membuat product uji');
  return created;
};

describe('DebtService - createDebt (T3.3)', () => {
  it('membuat debt open dengan paidAmount 0', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const shift = await createShift(h.db, user.id);
    expect(shift.id).toBeDefined();
    const customer = await createCustomer(h.db);
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: 'shift-1',
      customerId: customer.id,
      status: 'debt',
      total: 150_000,
    });

    const result = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customer.id,
      totalAmount: 150_000,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.debt.transactionId).toBe(trx.id);
    expect(result.debt.customerId).toBe(customer.id);
    expect(result.debt.totalAmount).toBe(150_000);
    expect(result.debt.paidAmount).toBe(0);
    expect(result.debt.status).toBe('open');
    expect(result.debt.dueDate).toBeNull();
    expect(result.debt._getRaw('deleted')).toBe(false);
    expect(result.warnings).toEqual([]);

    const integrity = await h.service.verifyIntegrity(result.debt.id);
    expect(integrity.ok).toBe(true);
    expect(integrity.sumPayments).toBe(0);
  });

  it('menolak totalAmount tidak valid', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const customer = await createCustomer(h.db);
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: 'shift-1',
      customerId: customer.id,
      status: 'debt',
      total: 50_000,
    });

    expect(
      await h.service.createDebt({ transactionId: trx.id, customerId: customer.id, totalAmount: 0 }),
    ).toEqual({ status: 'invalid_total_amount' });
    expect(
      await h.service.createDebt({ transactionId: trx.id, customerId: customer.id, totalAmount: -100 }),
    ).toEqual({ status: 'invalid_total_amount' });
    expect(
      await h.service.createDebt({ transactionId: trx.id, customerId: customer.id, totalAmount: 12.5 as unknown as number }),
    ).toEqual({ status: 'invalid_total_amount' });
  });

  it('menolak transaction_not_found dan transaction_not_debt', async () => {
    const h = makeHarness();
    const customer = await createCustomer(h.db);
    const user = await createUser(h.db);
    const trxPaid = await createTransaction(h.db, {
      userId: user.id,
      shiftId: 'shift-1',
      customerId: null,
      status: 'paid',
      total: 20_000,
    });

    expect(
      await h.service.createDebt({ transactionId: 'tidak-ada', customerId: customer.id, totalAmount: 10_000 }),
    ).toEqual({ status: 'transaction_not_found', transactionId: 'tidak-ada' });

    expect(
      await h.service.createDebt({ transactionId: trxPaid.id, customerId: customer.id, totalAmount: 10_000 }),
    ).toEqual({ status: 'transaction_not_debt', transactionId: trxPaid.id });
  });

  it('menolak debt_already_exists untuk transaction sama', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const customer = await createCustomer(h.db);
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: 'shift-1',
      customerId: customer.id,
      status: 'debt',
      total: 30_000,
    });

    const first = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customer.id,
      totalAmount: 30_000,
    });
    expect(first.status).toBe('ok');

    const second = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customer.id,
      totalAmount: 30_000,
    });
    expect(second).toEqual({ status: 'debt_already_exists', transactionId: trx.id });
  });

  it('warning plafon bon jika melebihi limit', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const customer = await createCustomer(h.db, { debtLimit: 100_000 });
    // hutang pertama 60_000
    const trx1 = await createTransaction(h.db, {
      userId: user.id,
      shiftId: 'shift-1',
      customerId: customer.id,
      status: 'debt',
      total: 60_000,
    });
    const r1 = await h.service.createDebt({
      transactionId: trx1.id,
      customerId: customer.id,
      totalAmount: 60_000,
    });
    expect(r1.status).toBe('ok');
    if (r1.status !== 'ok') return;
    expect(r1.warnings).toEqual([]);

    // hutang kedua 50_000 -> projected 110_000 > 100_000 -> warning
    const trx2 = await createTransaction(h.db, {
      userId: user.id,
      shiftId: 'shift-1',
      customerId: customer.id,
      status: 'debt',
      total: 50_000,
    });
    const r2 = await h.service.createDebt({
      transactionId: trx2.id,
      customerId: customer.id,
      totalAmount: 50_000,
    });
    expect(r2.status).toBe('ok');
    if (r2.status !== 'ok') return;
    expect(r2.warnings).toHaveLength(1);
    expect(r2.warnings[0].limit).toBe(100_000);
    expect(r2.warnings[0].outstanding).toBe(60_000);
    expect(r2.warnings[0].projected).toBe(110_000);
  });

  it('tidak warning bila tanpa plafon atau outstanding masih di bawah limit', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const customerNoLimit = await createCustomer(h.db, { debtLimit: null });
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: 'shift-1',
      customerId: customerNoLimit.id,
      status: 'debt',
      total: 1_000_000,
    });
    const result = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customerNoLimit.id,
      totalAmount: 1_000_000,
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.warnings).toEqual([]);
  });
});

describe('DebtService - recordPayment transitions open -> partial -> paid (T3.3)', () => {
  it.each([
    { paidSteps: [30_000], expectedStatuses: ['partial'] as const, total: 100_000 },
    { paidSteps: [40_000, 60_000], expectedStatuses: ['partial', 'paid'] as const, total: 100_000 },
    { paidSteps: [50_000, 25_000, 25_000], expectedStatuses: ['partial', 'partial', 'paid'] as const, total: 100_000 },
    { paidSteps: [100_000], expectedStatuses: ['paid'] as const, total: 100_000 },
  ])('transisi $paidSteps pada total $total', async ({ paidSteps, expectedStatuses, total }) => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const shift = await createShift(h.db, user.id);
    const customer = await createCustomer(h.db);
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: shift.id,
      customerId: customer.id,
      status: 'debt',
      total,
    });
    const created = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customer.id,
      totalAmount: total,
    });
    expect(created.status).toBe('ok');
    if (created.status !== 'ok') return;
    const debtId = created.debt.id;

    for (let i = 0; i < paidSteps.length; i += 1) {
      const amount = paidSteps[i];
      const result = await h.service.recordPayment({
        debtId,
        amount,
        method: 'cash',
        userId: user.id,
        shiftId: shift.id,
      });
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.debt.status).toBe(expectedStatuses[i]);
      const expectedPaid = paidSteps.slice(0, i + 1).reduce((a, b) => a + b, 0);
      expect(result.debt.paidAmount).toBe(expectedPaid);
      expect(result.remaining).toBe(total - expectedPaid);

      const integrity = await h.service.verifyIntegrity(debtId);
      expect(integrity.ok).toBe(true);
      expect(integrity.sumPayments).toBe(expectedPaid);
      expect(integrity.debtPaidAmount).toBe(expectedPaid);
    }
  });

  it('paid_amount selalu = SUM(debt_payments) diverifikasi', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const shift = await createShift(h.db, user.id);
    const customer = await createCustomer(h.db);
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: shift.id,
      customerId: customer.id,
      status: 'debt',
      total: 200_000,
    });
    const created = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customer.id,
      totalAmount: 200_000,
    });
    if (created.status !== 'ok') throw new Error('create gagal');
    const debtId = created.debt.id;

    const p1 = await h.service.recordPayment({ debtId, amount: 50_000, method: 'cash', userId: user.id, shiftId: shift.id });
    expect(p1.status).toBe('ok');
    const p2 = await h.service.recordPayment({ debtId, amount: 70_000, method: 'transfer', reference: 'TRF-1', userId: user.id, shiftId: shift.id });
    expect(p2.status).toBe('ok');

    const detail = await h.service.getDebtDetail(debtId);
    expect(detail).not.toBeNull();
    if (!detail) return;
    expect(detail.payments).toHaveLength(2);
    expect(detail.totalPaidVerified).toBe(120_000);
    expect(detail.debt.paidAmount).toBe(120_000);
    expect(detail.remaining).toBe(80_000);
    expect(detail.debt.status).toBe('partial');

    const integrity = await h.service.verifyIntegrity(debtId);
    expect(integrity.ok).toBe(true);
    expect(integrity.sumPayments).toBe(120_000);
  });

  it('menolak overpayment melebihi sisa', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const shift = await createShift(h.db, user.id);
    const customer = await createCustomer(h.db);
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: shift.id,
      customerId: customer.id,
      status: 'debt',
      total: 50_000,
    });
    const created = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customer.id,
      totalAmount: 50_000,
    });
    if (created.status !== 'ok') throw new Error('create gagal');
    const debtId = created.debt.id;

    const first = await h.service.recordPayment({ debtId, amount: 30_000, method: 'cash', userId: user.id, shiftId: shift.id });
    expect(first.status).toBe('ok');

    const over = await h.service.recordPayment({ debtId, amount: 25_000, method: 'cash', userId: user.id, shiftId: shift.id });
    expect(over).toEqual({ status: 'amount_exceeds_remaining', remaining: 20_000, requested: 25_000 });

    const exact = await h.service.recordPayment({ debtId, amount: 20_000, method: 'cash', userId: user.id, shiftId: shift.id });
    expect(exact.status).toBe('ok');
    if (exact.status !== 'ok') return;
    expect(exact.debt.status).toBe('paid');
  });

  it('menolak pembayaran setelah lunas', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const shift = await createShift(h.db, user.id);
    const customer = await createCustomer(h.db);
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: shift.id,
      customerId: customer.id,
      status: 'debt',
      total: 10_000,
    });
    const created = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customer.id,
      totalAmount: 10_000,
    });
    if (created.status !== 'ok') throw new Error('create gagal');
    const debtId = created.debt.id;

    const paid = await h.service.recordPayment({ debtId, amount: 10_000, method: 'cash', userId: user.id, shiftId: shift.id });
    expect(paid.status).toBe('ok');

    const again = await h.service.recordPayment({ debtId, amount: 1_000, method: 'cash', userId: user.id, shiftId: shift.id });
    expect(again).toEqual({ status: 'already_paid', debtId });
  });

  it('validasi amount & method', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const shift = await createShift(h.db, user.id);
    const customer = await createCustomer(h.db);
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: shift.id,
      customerId: customer.id,
      status: 'debt',
      total: 20_000,
    });
    const created = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customer.id,
      totalAmount: 20_000,
    });
    if (created.status !== 'ok') throw new Error('create gagal');
    const debtId = created.debt.id;

    expect(await h.service.recordPayment({ debtId, amount: 0 as unknown as number, method: 'cash', userId: user.id, shiftId: shift.id })).toEqual({
      status: 'invalid_amount',
    });
    expect(await h.service.recordPayment({ debtId, amount: -5_000, method: 'cash', userId: user.id, shiftId: shift.id })).toEqual({
      status: 'invalid_amount',
    });
    expect(await h.service.recordPayment({ debtId, amount: 12.5 as unknown as number, method: 'cash', userId: user.id, shiftId: shift.id })).toEqual({
      status: 'invalid_amount',
    });
    expect(
      await h.service.recordPayment({ debtId, amount: 5_000, method: 'invalid' as unknown as 'cash', userId: user.id, shiftId: shift.id }),
    ).toEqual({ status: 'invalid_method', method: 'invalid' });
  });

  it('validasi debt/user/shift tidak ditemukan', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const shift = await createShift(h.db, user.id);
    const customer = await createCustomer(h.db);
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: shift.id,
      customerId: customer.id,
      status: 'debt',
      total: 15_000,
    });
    const created = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customer.id,
      totalAmount: 15_000,
    });
    if (created.status !== 'ok') throw new Error('create gagal');
    const debtId = created.debt.id;

    expect(await h.service.recordPayment({ debtId: 'tidak-ada', amount: 5_000, method: 'cash', userId: user.id, shiftId: shift.id })).toEqual({
      status: 'debt_not_found',
      debtId: 'tidak-ada',
    });
    expect(await h.service.recordPayment({ debtId, amount: 5_000, method: 'cash', userId: 'tidak-ada', shiftId: shift.id })).toEqual({
      status: 'user_not_found',
      userId: 'tidak-ada',
    });
    expect(await h.service.recordPayment({ debtId, amount: 5_000, method: 'cash', userId: user.id, shiftId: 'tidak-ada' })).toEqual({
      status: 'shift_not_found',
      shiftId: 'tidak-ada',
    });
  });

  it('mendukung semua metode pembayaran', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const shift = await createShift(h.db, user.id);
    const customer = await createCustomer(h.db);
    const trx = await createTransaction(h.db, {
      userId: user.id,
      shiftId: shift.id,
      customerId: customer.id,
      status: 'debt',
      total: 40_000,
    });
    const created = await h.service.createDebt({
      transactionId: trx.id,
      customerId: customer.id,
      totalAmount: 40_000,
    });
    if (created.status !== 'ok') throw new Error('create gagal');
    const debtId = created.debt.id;

    for (const method of ['cash', 'qris', 'debit', 'transfer'] as const) {
      const trx2 = await createTransaction(h.db, {
        userId: user.id,
        shiftId: shift.id,
        customerId: customer.id,
        status: 'debt',
        total: 10_000,
      });
      const d = await h.service.createDebt({ transactionId: trx2.id, customerId: customer.id, totalAmount: 10_000 });
      if (d.status !== 'ok') throw new Error('create gagal');
      const result = await h.service.recordPayment({
        debtId: d.debt.id,
        amount: 5_000,
        method,
        userId: user.id,
        shiftId: shift.id,
        reference: method === 'qris' ? 'QR-123' : null,
      });
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') continue;
      expect(result.payment.method).toBe(method);
    }
    expect(debtId).toBeDefined();
  });

  it('listDebts dan getOutstandingForCustomer', async () => {
    const h = makeHarness();
    const user = await createUser(h.db);
    const shift = await createShift(h.db, user.id);
    const customer = await createCustomer(h.db);
    const trx1 = await createTransaction(h.db, {
      userId: user.id,
      shiftId: shift.id,
      customerId: customer.id,
      status: 'debt',
      total: 50_000,
    });
    const trx2 = await createTransaction(h.db, {
      userId: user.id,
      shiftId: shift.id,
      customerId: customer.id,
      status: 'debt',
      total: 30_000,
    });
    const d1 = await h.service.createDebt({ transactionId: trx1.id, customerId: customer.id, totalAmount: 50_000 });
    const d2 = await h.service.createDebt({ transactionId: trx2.id, customerId: customer.id, totalAmount: 30_000 });
    if (d1.status !== 'ok' || d2.status !== 'ok') throw new Error('create gagal');

    await h.service.recordPayment({ debtId: d1.debt.id, amount: 50_000, method: 'cash', userId: user.id, shiftId: shift.id });

    const all = await h.service.listDebts();
    expect(all).toHaveLength(2);

    const paid = await h.service.listDebts({ status: 'paid' });
    expect(paid).toHaveLength(1);
    expect(paid[0].id).toBe(d1.debt.id);

    const open = await h.service.listDebts({ status: 'open' });
    expect(open).toHaveLength(1);

    const outstanding = await h.service.getOutstandingForCustomer(customer.id);
    expect(outstanding).toBe(30_000);
  });
});

describe('DebtService - integrasi CheckoutService atomik (T3.3)', () => {
  it('checkout bon membuat debt open atomik', async () => {
    const db = makeDb();
    const checkout = new CheckoutService(db);
    const debtService = new DebtService(db);
    const user = await createUser(db);
    const shift = await createShift(db, user.id);
    const customer = await createCustomer(db);
    const product = await createProduct(db, { stock: 10, sellPrice: 25_000 });

    const result = await checkout.checkout({
      shiftId: shift.id,
      userId: user.id,
      customerId: customer.id,
      items: [{ productId: product.id, qty: 2, unitPrice: 25_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [],
      status: 'debt',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const debt = await debtService.findDebtByTransactionId(result.transaction.id);
    expect(debt).not.toBeNull();
    expect(debt?.totalAmount).toBe(50_000);
    expect(debt?.paidAmount).toBe(0);
    expect(debt?.status).toBe('open');
    expect(debt?.customerId).toBe(customer.id);

    const integrity = await debtService.verifyIntegrity(debt!.id);
    expect(integrity.ok).toBe(true);
  });

  it('checkout paid tidak membuat debt', async () => {
    const db = makeDb();
    const checkout = new CheckoutService(db);
    const debtService = new DebtService(db);
    const user = await createUser(db);
    const shift = await createShift(db, user.id);
    const product = await createProduct(db, { stock: 10, sellPrice: 10_000 });

    const result = await checkout.checkout({
      shiftId: shift.id,
      userId: user.id,
      items: [{ productId: product.id, qty: 1, unitPrice: 10_000, discount: 0 }],
      transactionDiscount: 0,
      tax: 0,
      payments: [{ method: 'cash', amount: 10_000 }],
      status: 'paid',
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const debt = await debtService.findDebtByTransactionId(result.transaction.id);
    expect(debt).toBeNull();
  });
});
