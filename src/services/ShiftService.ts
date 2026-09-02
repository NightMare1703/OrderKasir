import { Database, Q } from '@nozbe/watermelondb';

import CashDrawerPull from '../database/models/cash-drawer-pull';
import DebtPayment from '../database/models/debt-payment';
import Payment, { PaymentMethod } from '../database/models/payment';
import Shift, { ShiftStatus } from '../database/models/shift';
import Transaction from '../database/models/transaction';
import TransactionItem from '../database/models/transaction-item';
import User from '../database/models/user';

export type { ShiftStatus };

export type ShiftServiceOptions = {
  now?: () => number;
};

export type OpenShiftInput = {
  userId: string;
  openingCash: number;
  notes?: string | null;
};

export type CloseShiftInput = {
  shiftId: string;
  closingCash: number;
};

export type DrawerPullInput = {
  shiftId: string;
  amount: number;
  reason?: string | null;
  userId: string;
};

export type OpenShiftResult =
  | { status: 'ok'; shift: Shift }
  | { status: 'user_not_found'; userId: string }
  | { status: 'invalid_opening_cash' }
  | { status: 'active_shift_exists'; activeShiftId: string };

export type CloseShiftResult =
  | { status: 'ok'; shift: Shift; expectedCash: number; difference: number }
  | { status: 'shift_not_found'; shiftId: string }
  | { status: 'shift_already_closed'; shiftId: string }
  | { status: 'invalid_closing_cash' };

export type DrawerPullResult =
  | { status: 'ok'; pull: CashDrawerPull }
  | { status: 'shift_not_found'; shiftId: string }
  | { status: 'shift_already_closed'; shiftId: string }
  | { status: 'user_not_found'; userId: string }
  | { status: 'invalid_amount' };

export type ShiftSummary = {
  shift: Shift;
  transactionCount: number;
  voidCount: number;
  totalSales: number;
  discountTotal: number;
  taxTotal: number;
  breakdown: Record<PaymentMethod, number>;
  cashSales: number;
  cashDebtPayments: number;
  drawerPullTotal: number;
  expectedCash: number;
};

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const isValidMoney = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

export class ShiftService {
  private readonly database: Database;

  private readonly now: () => number;

  constructor(database: Database, options: ShiftServiceOptions = {}) {
    this.database = database;
    this.now = options.now ?? Date.now;
  }

  async getActiveShift(): Promise<Shift | null> {
    const rows = await this.database
      .get<Shift>('shifts')
      .query(Q.where('status', 'open'), Q.where('deleted', false))
      .fetch();
    return rows[0] ?? null;
  }

  async getShiftById(shiftId: string): Promise<Shift | null> {
    try {
      const shift = await this.database.get<Shift>('shifts').find(shiftId);
      return shift._getRaw('deleted') ? null : shift;
    } catch {
      return null;
    }
  }

  async listShifts(): Promise<Shift[]> {
    const rows = await this.database
      .get<Shift>('shifts')
      .query(Q.where('deleted', false), Q.sortBy('opened_at', Q.desc))
      .fetch();
    return rows;
  }

  async openShift(input: OpenShiftInput): Promise<OpenShiftResult> {
    const { userId } = input;

    if (!isValidMoney(input.openingCash)) {
      return { status: 'invalid_opening_cash' };
    }

    const user = await this.findActiveUser(userId);
    if (!user) {
      return { status: 'user_not_found', userId };
    }

    const active = await this.getActiveShift();
    if (active) {
      return { status: 'active_shift_exists', activeShiftId: active.id };
    }

    const timestamp = this.now();
    const notes = normalizeOptionalText(input.notes);
    let created: Shift | null = null;

    await this.database.write(async () => {
      created = await this.database.get<Shift>('shifts').create((raw) => {
        raw.userId = userId;
        raw.openedAt = timestamp;
        raw.closedAt = null;
        raw.openingCash = input.openingCash;
        raw.closingCash = null;
        raw.expectedCash = null;
        raw.difference = null;
        raw.status = 'open';
        raw.notes = notes;
        raw.createdAt = timestamp;
        raw.updatedAt = timestamp;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', timestamp);
      });
    });

    if (!created) {
      throw new Error('gagal membuka shift');
    }

    return { status: 'ok', shift: created };
  }

  async closeShift(input: CloseShiftInput): Promise<CloseShiftResult> {
    const { shiftId } = input;

    if (!isValidMoney(input.closingCash)) {
      return { status: 'invalid_closing_cash' };
    }

    const shift = await this.getShiftById(shiftId);
    if (!shift) {
      return { status: 'shift_not_found', shiftId };
    }
    if (shift.status === 'closed') {
      return { status: 'shift_already_closed', shiftId };
    }

    const expectedCash = await this.computeExpectedCash(shiftId);
    const difference = input.closingCash - expectedCash;
    const timestamp = this.now();

    await this.database.write(async () => {
      await shift.update((raw) => {
        raw.closedAt = timestamp;
        raw.closingCash = input.closingCash;
        raw.expectedCash = expectedCash;
        raw.difference = difference;
        raw.status = 'closed';
        raw.updatedAt = timestamp;
        raw._setRaw('last_modified', timestamp);
      });
    });

    return { status: 'ok', shift, expectedCash, difference };
  }

  async recordDrawerPull(input: DrawerPullInput): Promise<DrawerPullResult> {
    const { shiftId, amount, userId } = input;

    if (!Number.isInteger(amount) || amount <= 0) {
      return { status: 'invalid_amount' };
    }

    const shift = await this.getShiftById(shiftId);
    if (!shift) {
      return { status: 'shift_not_found', shiftId };
    }
    if (shift.status === 'closed') {
      return { status: 'shift_already_closed', shiftId };
    }

    const user = await this.findActiveUser(userId);
    if (!user) {
      return { status: 'user_not_found', userId };
    }

    const timestamp = this.now();
    const reason = normalizeOptionalText(input.reason);
    let created: CashDrawerPull | null = null;

    await this.database.write(async () => {
      created = await this.database.get<CashDrawerPull>('cash_drawer_pulls').create((raw) => {
        raw.shiftId = shiftId;
        raw.amount = amount;
        raw.reason = reason;
        raw.userId = userId;
        raw.createdAt = timestamp;
        raw.updatedAt = timestamp;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', timestamp);
      });
    });

    if (!created) {
      throw new Error('gagal mencatat pengambilan uang');
    }

    return { status: 'ok', pull: created };
  }

  async computeExpectedCash(shiftId: string): Promise<number> {
    const summary = await this.getShiftSummary(shiftId);
    return summary.expectedCash;
  }

  async getShiftSummary(shiftId: string): Promise<ShiftSummary> {
    const shift = await this.getShiftById(shiftId);
    if (!shift) {
      throw new Error(`shift tidak ditemukan: ${shiftId}`);
    }

    const openingCash = shift.openingCash;

    const transactions = await this.database
      .get<Transaction>('transactions')
      .query(Q.where('shift_id', shiftId), Q.where('deleted', false))
      .fetch();

    const nonVoid = transactions.filter((trx) => trx.status !== 'void');
    const validIds = nonVoid.map((trx) => trx.id);
    const voidCount = transactions.length - nonVoid.length;
    const transactionCount = nonVoid.length;

    let totalSales = 0;
    let discountFromTransactions = 0;
    let taxTotal = 0;
    for (const trx of nonVoid) {
      totalSales += trx.total;
      discountFromTransactions += trx.discount;
      taxTotal += trx.tax;
    }

    let discountFromItems = 0;
    if (validIds.length > 0) {
      const items = await this.database
        .get<TransactionItem>('transaction_items')
        .query(Q.where('transaction_id', Q.oneOf(validIds)), Q.where('deleted', false))
        .fetch();
      discountFromItems = items.reduce((sum, item) => sum + item.discount, 0);
    }
    const discountTotal = discountFromTransactions + discountFromItems;

    const breakdown: Record<PaymentMethod, number> = {
      cash: 0,
      qris: 0,
      debit: 0,
      transfer: 0,
    };
    let cashSales = 0;
    if (validIds.length > 0) {
      const payments = await this.database
        .get<Payment>('payments')
        .query(Q.where('deleted', false), Q.where('transaction_id', Q.oneOf(validIds)))
        .fetch();
      for (const payment of payments) {
        const method = payment.method as PaymentMethod;
        if (method in breakdown) {
          breakdown[method] += payment.amount;
        }
      }
      cashSales = breakdown.cash;
    }

    let cashDebtPayments = 0;
    try {
      const debtPayments = await this.database
        .get<DebtPayment>('debt_payments')
        .query(Q.where('shift_id', shiftId), Q.where('method', 'cash'), Q.where('deleted', false))
        .fetch();
      cashDebtPayments = debtPayments.reduce((sum, payment) => sum + payment.amount, 0);
    } catch {
      cashDebtPayments = 0;
    }

    let drawerPullTotal = 0;
    try {
      const pulls = await this.database
        .get<CashDrawerPull>('cash_drawer_pulls')
        .query(Q.where('shift_id', shiftId), Q.where('deleted', false))
        .fetch();
      drawerPullTotal = pulls.reduce((sum, pull) => sum + pull.amount, 0);
    } catch {
      drawerPullTotal = 0;
    }

    const expectedCash = openingCash + cashSales + cashDebtPayments - drawerPullTotal;

    return {
      shift,
      transactionCount,
      voidCount,
      totalSales,
      discountTotal,
      taxTotal,
      breakdown,
      cashSales,
      cashDebtPayments,
      drawerPullTotal,
      expectedCash,
    };
  }

  private async findActiveUser(userId: string): Promise<User | null> {
    try {
      const user = await this.database.get<User>('users').find(userId);
      const deleted = user._getRaw('deleted') as boolean | undefined;
      if (deleted) {
        return null;
      }
      return user.isActive ? user : null;
    } catch {
      return null;
    }
  }
}
