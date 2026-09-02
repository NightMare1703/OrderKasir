import { Database, Q } from '@nozbe/watermelondb';

import Customer from '../database/models/customer';
import Debt, { DebtStatus } from '../database/models/debt';
import DebtPayment from '../database/models/debt-payment';
import { PaymentMethod } from '../database/models/payment';
import Transaction from '../database/models/transaction';
import User from '../database/models/user';
import Shift from '../database/models/shift';

export type { DebtStatus };

export const DEBT_STATUSES = ['open', 'partial', 'paid'] as const satisfies readonly DebtStatus[];

export const PAYMENT_METHODS = [
  'cash',
  'qris',
  'debit',
  'transfer',
] as const satisfies readonly PaymentMethod[];

const isValidPaymentMethod = (value: unknown): value is PaymentMethod =>
  typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);

const isValidDebtStatus = (value: unknown): value is DebtStatus =>
  typeof value === 'string' && (DEBT_STATUSES as readonly string[]).includes(value);

const isValidMoney = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const computeDebtStatus = (total: number, paid: number): DebtStatus => {
  if (paid === 0) return 'open';
  if (paid > 0 && paid < total) return 'partial';
  return 'paid';
};

export type DebtServiceOptions = {
  now?: () => number;
};

export type CreateDebtInput = {
  transactionId: string;
  customerId: string;
  totalAmount: number;
  dueDate?: number | null;
};

export type CreateDebtResult =
  | { status: 'ok'; debt: Debt; warnings: DebtLimitWarning[] }
  | { status: 'invalid_transaction_id' }
  | { status: 'invalid_customer_id' }
  | { status: 'invalid_total_amount' }
  | { status: 'invalid_due_date' }
  | { status: 'transaction_not_found'; transactionId: string }
  | { status: 'customer_not_found'; customerId: string }
  | { status: 'transaction_not_debt'; transactionId: string }
  | { status: 'debt_already_exists'; transactionId: string };

export type DebtLimitWarning = {
  customerId: string;
  limit: number;
  outstanding: number;
  projected: number;
};

export type RecordDebtPaymentInput = {
  debtId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  userId: string;
  shiftId: string;
};

export type RecordDebtPaymentResult =
  | { status: 'ok'; debt: Debt; payment: DebtPayment; remaining: number }
  | { status: 'invalid_amount' }
  | { status: 'invalid_method'; method: string }
  | { status: 'debt_not_found'; debtId: string }
  | { status: 'user_not_found'; userId: string }
  | { status: 'shift_not_found'; shiftId: string }
  | { status: 'already_paid'; debtId: string }
  | { status: 'amount_exceeds_remaining'; remaining: number; requested: number };

export type DebtDetail = {
  debt: Debt;
  payments: DebtPayment[];
  customer: Customer | null;
  transaction: Transaction | null;
  totalPaidVerified: number;
  remaining: number;
};

export class DebtService {
  private readonly database: Database;

  private readonly now: () => number;

  constructor(database: Database, options: DebtServiceOptions = {}) {
    this.database = database;
    this.now = options.now ?? Date.now;
  }

  async createDebt(input: CreateDebtInput): Promise<CreateDebtResult> {
    const transactionId = input.transactionId?.trim();
    const customerId = input.customerId?.trim();
    if (!transactionId) {
      return { status: 'invalid_transaction_id' };
    }
    if (!customerId) {
      return { status: 'invalid_customer_id' };
    }
    if (!isValidMoney(input.totalAmount) || input.totalAmount <= 0) {
      return { status: 'invalid_total_amount' };
    }
    if (
      input.dueDate !== undefined &&
      input.dueDate !== null &&
      (typeof input.dueDate !== 'number' || !Number.isFinite(input.dueDate))
    ) {
      return { status: 'invalid_due_date' };
    }

    const transaction = await this.findTransaction(transactionId);
    if (!transaction) {
      return { status: 'transaction_not_found', transactionId };
    }
    if (transaction.status !== 'debt') {
      return { status: 'transaction_not_debt', transactionId };
    }

    const customer = await this.findActiveCustomer(customerId);
    if (!customer) {
      return { status: 'customer_not_found', customerId };
    }

    const existing = await this.findDebtByTransactionId(transactionId);
    if (existing) {
      return { status: 'debt_already_exists', transactionId };
    }

    const warnings = await this.evaluateDebtLimit(customerId, input.totalAmount);

    const timestamp = this.now();
    const dueDate = input.dueDate ?? null;
    let created: Debt | null = null;

    await this.database.write(async () => {
      created = await this.database.get<Debt>('debts').create((raw) => {
        raw.transactionId = transactionId;
        raw.customerId = customerId;
        raw.totalAmount = input.totalAmount;
        raw.paidAmount = 0;
        raw.dueDate = dueDate;
        raw.status = 'open';
        raw.createdAt = timestamp;
        raw.updatedAt = timestamp;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', timestamp);
      });
    });

    if (!created) {
      throw new Error('gagal membuat debt');
    }

    return { status: 'ok', debt: created, warnings };
  }

  async findDebt(debtId: string): Promise<Debt | null> {
    try {
      const debt = await this.database.get<Debt>('debts').find(debtId);
      return debt._getRaw('deleted') ? null : debt;
    } catch {
      return null;
    }
  }

  async findDebtByTransactionId(transactionId: string): Promise<Debt | null> {
    const rows = await this.database
      .get<Debt>('debts')
      .query(Q.where('transaction_id', transactionId), Q.where('deleted', false))
      .fetch();
    return rows[0] ?? null;
  }

  async listDebts(filter: { customerId?: string; status?: DebtStatus } = {}): Promise<Debt[]> {
    const clauses: ReturnType<typeof Q.where>[] = [Q.where('deleted', false)];
    if (filter.customerId) {
      clauses.push(Q.where('customer_id', filter.customerId));
    }
    if (filter.status && isValidDebtStatus(filter.status)) {
      clauses.push(Q.where('status', filter.status));
    }
    const rows = await this.database.get<Debt>('debts').query(...clauses).fetch();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }

  async listDebtsByCustomer(customerId: string): Promise<Debt[]> {
    return this.listDebts({ customerId });
  }

  async getOutstandingForCustomer(customerId: string): Promise<number> {
    const debts = await this.database
      .get<Debt>('debts')
      .query(Q.where('customer_id', customerId), Q.where('deleted', false))
      .fetch();
    let total = 0;
    for (const debt of debts) {
      if (debt.status !== 'paid') {
        total += debt.totalAmount - debt.paidAmount;
      }
    }
    return total;
  }

  async willExceedDebtLimit(
    customerId: string,
    additionalAmount: number,
  ): Promise<{ exceeded: boolean; limit: number | null; outstanding: number; projected: number }> {
    const customer = await this.findActiveCustomer(customerId);
    const limit = customer?.debtLimit ?? null;
    const outstanding = await this.getOutstandingForCustomer(customerId);
    const projected = outstanding + additionalAmount;
    if (limit === null) {
      return { exceeded: false, limit, outstanding, projected };
    }
    return { exceeded: projected > limit, limit, outstanding, projected };
  }

  async recordPayment(input: RecordDebtPaymentInput): Promise<RecordDebtPaymentResult> {
    const { debtId, amount, method, userId, shiftId } = input;

    if (!Number.isInteger(amount) || amount <= 0) {
      return { status: 'invalid_amount' };
    }
    if (!isValidPaymentMethod(method)) {
      return { status: 'invalid_method', method: String(method) };
    }

    const debt = await this.findDebt(debtId);
    if (!debt) {
      return { status: 'debt_not_found', debtId };
    }
    if (debt.status === 'paid') {
      return { status: 'already_paid', debtId };
    }

    const user = await this.findActiveUser(userId);
    if (!user) {
      return { status: 'user_not_found', userId };
    }

    const shift = await this.findShift(shiftId);
    if (!shift) {
      return { status: 'shift_not_found', shiftId };
    }

    const remaining = debt.totalAmount - debt.paidAmount;
    if (amount > remaining) {
      return { status: 'amount_exceeds_remaining', remaining, requested: amount };
    }

    const timestamp = this.now();
    const reference = normalizeOptionalText(input.reference);
    let createdPayment: DebtPayment | null = null;

    await this.database.write(async () => {
      createdPayment = await this.database.get<DebtPayment>('debt_payments').create((raw) => {
        raw.debtId = debtId;
        raw.amount = amount;
        raw.method = method;
        raw.reference = reference;
        raw.userId = userId;
        raw.shiftId = shiftId;
        raw.paidAt = timestamp;
        raw.createdAt = timestamp;
        raw.updatedAt = timestamp;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', timestamp);
      });

      const newPaid = debt.paidAmount + amount;
      const newStatus = computeDebtStatus(debt.totalAmount, newPaid);

      await debt.update((raw) => {
        raw.paidAmount = newPaid;
        raw.status = newStatus;
        raw.updatedAt = timestamp;
        raw._setRaw('last_modified', timestamp);
      });
    });

    if (!createdPayment) {
      throw new Error('gagal membuat debt_payment');
    }

    const updatedRemaining = debt.totalAmount - debt.paidAmount;

    return { status: 'ok', debt, payment: createdPayment, remaining: updatedRemaining };
  }

  async getDebtDetail(debtId: string): Promise<DebtDetail | null> {
    const debt = await this.findDebt(debtId);
    if (!debt) return null;

    const payments = await this.database
      .get<DebtPayment>('debt_payments')
      .query(Q.where('debt_id', debtId), Q.where('deleted', false), Q.sortBy('paid_at', Q.asc))
      .fetch();

    const totalPaidVerified = payments.reduce((sum, payment) => sum + payment.amount, 0);

    let customer: Customer | null = null;
    try {
      const found = await this.database.get<Customer>('customers').find(debt.customerId);
      customer = found._getRaw('deleted') ? null : found;
    } catch {
      customer = null;
    }

    let transaction: Transaction | null = null;
    try {
      const found = await this.database.get<Transaction>('transactions').find(debt.transactionId);
      transaction = found._getRaw('deleted') ? null : found;
    } catch {
      transaction = null;
    }

    const remaining = debt.totalAmount - debt.paidAmount;

    return { debt, payments, customer, transaction, totalPaidVerified, remaining };
  }

  async verifyIntegrity(debtId: string): Promise<{ ok: boolean; debtPaidAmount: number; sumPayments: number }> {
    const debt = await this.findDebt(debtId);
    if (!debt) {
      throw new Error(`debt tidak ditemukan: ${debtId}`);
    }
    const payments = await this.database
      .get<DebtPayment>('debt_payments')
      .query(Q.where('debt_id', debtId), Q.where('deleted', false))
      .fetch();
    const sumPayments = payments.reduce((sum, payment) => sum + payment.amount, 0);
    return { ok: debt.paidAmount === sumPayments, debtPaidAmount: debt.paidAmount, sumPayments };
  }

  async listPayments(debtId: string): Promise<DebtPayment[]> {
    return this.database
      .get<DebtPayment>('debt_payments')
      .query(Q.where('debt_id', debtId), Q.where('deleted', false), Q.sortBy('paid_at', Q.asc))
      .fetch();
  }

  private async evaluateDebtLimit(customerId: string, additionalAmount: number): Promise<DebtLimitWarning[]> {
    const customer = await this.findActiveCustomer(customerId);
    if (!customer || customer.debtLimit === null) {
      return [];
    }
    const limit = customer.debtLimit;
    const outstanding = await this.getOutstandingForCustomer(customerId);
    const projected = outstanding + additionalAmount;
    if (projected > limit) {
      return [{ customerId, limit, outstanding, projected }];
    }
    return [];
  }

  private async findActiveCustomer(customerId: string): Promise<Customer | null> {
    try {
      const customer = await this.database.get<Customer>('customers').find(customerId);
      return customer._getRaw('deleted') ? null : customer;
    } catch {
      return null;
    }
  }

  private async findActiveUser(userId: string): Promise<User | null> {
    try {
      const user = await this.database.get<User>('users').find(userId);
      const deleted = user._getRaw('deleted') as boolean | undefined;
      if (deleted) return null;
      return user.isActive ? user : null;
    } catch {
      return null;
    }
  }

  private async findShift(shiftId: string): Promise<Shift | null> {
    try {
      const shift = await this.database.get<Shift>('shifts').find(shiftId);
      return shift._getRaw('deleted') ? null : shift;
    } catch {
      return null;
    }
  }

  private async findTransaction(transactionId: string): Promise<Transaction | null> {
    try {
      const trx = await this.database.get<Transaction>('transactions').find(transactionId);
      return trx._getRaw('deleted') ? null : trx;
    } catch {
      return null;
    }
  }
}
