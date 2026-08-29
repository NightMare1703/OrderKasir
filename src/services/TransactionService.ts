import { Database, Q } from '@nozbe/watermelondb';

import Payment, { PaymentMethod } from '../database/models/payment';
import Product from '../database/models/product';
import StockMovement, { StockMovementType } from '../database/models/stock-movement';
import Transaction, { TransactionStatus } from '../database/models/transaction';
import TransactionItem from '../database/models/transaction-item';
import User from '../database/models/user';

export type TransactionFilter = {
  dateFrom?: number;
  dateTo?: number;
  method?: PaymentMethod;
  userId?: string;
  status?: TransactionStatus;
  searchInvoice?: string;
};

export type TransactionDetail = {
  transaction: Transaction;
  items: TransactionItem[];
  payments: Payment[];
};

export type VoidInput = {
  transactionId: string;
  reason: string;
  adminUserId: string;
  adminPin: string;
};

export type VoidResult =
  | { status: 'ok'; transaction: Transaction }
  | { status: 'not_found'; transactionId: string }
  | { status: 'already_void' }
  | { status: 'reason_required' }
  | { status: 'admin_not_found'; adminUserId: string }
  | { status: 'admin_inactive' }
  | { status: 'not_admin' }
  | { status: 'invalid_pin' }
  | { status: 'product_not_found'; productId: string };

export type PinVerifier = {
  verify(pin: string, hash: string): Promise<boolean>;
};

export type TransactionServiceOptions = {
  now?: () => number;
  hasher?: PinVerifier;
};

const normalizeReason = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const isValidStatus = (value: string): value is TransactionStatus =>
  value === 'paid' || value === 'void' || value === 'debt';

export class TransactionService {
  private readonly database: Database;

  private readonly now: () => number;

  private readonly hasher: PinVerifier | null;

  constructor(database: Database, options: TransactionServiceOptions = {}) {
    this.database = database;
    this.now = options.now ?? Date.now;
    this.hasher = options.hasher ?? null;
  }

  async list(filter: TransactionFilter = {}): Promise<Transaction[]> {
    const clauses: ReturnType<typeof Q.where>[] = [Q.where('deleted', false)];

    if (filter.status !== undefined) {
      if (isValidStatus(filter.status)) {
        clauses.push(Q.where('status', filter.status));
      }
    }
    if (filter.userId !== undefined && filter.userId.trim() !== '') {
      clauses.push(Q.where('user_id', filter.userId));
    }
    if (filter.dateFrom !== undefined) {
      clauses.push(Q.where('created_at', Q.gte(filter.dateFrom)));
    }
    if (filter.dateTo !== undefined) {
      clauses.push(Q.where('created_at', Q.lte(filter.dateTo)));
    }
    if (filter.searchInvoice !== undefined && filter.searchInvoice.trim() !== '') {
      const term = filter.searchInvoice.trim();
      clauses.push(Q.where('invoice_no', Q.like(`%${term}%`)));
    }

    let rows = await this.database.get<Transaction>('transactions').query(...clauses).fetch();

    if (filter.method !== undefined) {
      const payments = await this.database
        .get<Payment>('payments')
        .query(Q.where('method', filter.method), Q.where('deleted', false))
        .fetch();
      const allowedIds = new Set(payments.map((p) => p.transactionId));
      rows = rows.filter((t) => allowedIds.has(t.id));
    }

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getDetail(transactionId: string): Promise<TransactionDetail | null> {
    let transaction: Transaction;
    try {
      transaction = await this.database.get<Transaction>('transactions').find(transactionId);
    } catch {
      return null;
    }
    if (transaction._getRaw('deleted')) {
      return null;
    }

    const [items, payments] = await Promise.all([
      this.database
        .get<TransactionItem>('transaction_items')
        .query(Q.where('transaction_id', transaction.id), Q.where('deleted', false))
        .fetch(),
      this.database
        .get<Payment>('payments')
        .query(Q.where('transaction_id', transaction.id), Q.where('deleted', false))
        .fetch(),
    ]);

    return { transaction, items, payments };
  }

  async voidTransaction(input: VoidInput): Promise<VoidResult> {
    const reason = normalizeReason(input.reason);
    if (reason === null) {
      return { status: 'reason_required' };
    }

    let transaction: Transaction;
    try {
      transaction = await this.database.get<Transaction>('transactions').find(input.transactionId);
    } catch {
      return { status: 'not_found', transactionId: input.transactionId };
    }
    if ((transaction._getRaw('deleted') as boolean) === true) {
      return { status: 'not_found', transactionId: input.transactionId };
    }
    if (transaction.status === 'void') {
      return { status: 'already_void' };
    }

    const admin = await this.findUser(input.adminUserId);
    if (!admin) {
      return { status: 'admin_not_found', adminUserId: input.adminUserId };
    }
    if (!admin.isActive) {
      return { status: 'admin_inactive' };
    }
    if (admin.role !== 'admin') {
      return { status: 'not_admin' };
    }

    if (this.hasher) {
      const ok = await this.hasher.verify(input.adminPin, admin.pinHash);
      if (!ok) {
        return { status: 'invalid_pin' };
      }
    } else {
      const { AuthService } = await import('./AuthService');
      const tempService = new AuthService(this.database, { now: this.now });
      const ok = await tempService.verifyPin(input.adminPin, admin.pinHash);
      if (!ok) {
        return { status: 'invalid_pin' };
      }
    }

    const items = await this.database
      .get<TransactionItem>('transaction_items')
      .query(Q.where('transaction_id', transaction.id), Q.where('deleted', false))
      .fetch();

    const qtyByProduct = new Map<string, number>();
    for (const item of items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.qty);
    }

    const productMap = new Map<string, Product>();
    for (const productId of qtyByProduct.keys()) {
      const product = await this.findProductAny(productId);
      if (!product) {
        return { status: 'product_not_found', productId };
      }
      productMap.set(productId, product);
    }

    const timestamp = this.now();

    await this.database.write(async () => {
      await transaction.update((raw) => {
        raw.status = 'void' as TransactionStatus;
        raw.voidReason = reason;
        raw.voidByUserId = admin.id;
        raw.updatedAt = timestamp;
        raw._setRaw('last_modified', timestamp);
      });

      for (const [productId, totalQty] of qtyByProduct) {
        const product = productMap.get(productId);
        if (!product) {
          throw new Error('produk hilang saat void');
        }
        const stockBefore = product.stock;
        const stockAfter = stockBefore + totalQty;

        await this.database.get<StockMovement>('stock_movements').create((raw) => {
          raw.productId = productId;
          raw.type = 'void' as StockMovementType;
          raw.qty = totalQty;
          raw.stockBefore = stockBefore;
          raw.stockAfter = stockAfter;
          raw.reason = reason;
          raw.refType = 'transaction';
          raw.refId = transaction.invoiceNo;
          raw.userId = admin.id;
          raw.createdAt = timestamp;
          raw.updatedAt = timestamp;
          raw._setRaw('deleted', false);
          raw._setRaw('last_modified', timestamp);
        });

        await product.update((raw) => {
          raw.stock = stockAfter;
          raw.updatedAt = timestamp;
          raw._setRaw('last_modified', timestamp);
        });
      }
    });

    return { status: 'ok', transaction };
  }

  private async findUser(userId: string): Promise<User | null> {
    try {
      const user = await this.database.get<User>('users').find(userId);
      const deleted = user._getRaw('deleted') as boolean | undefined;
      if (deleted) return null;
      return user;
    } catch {
      return null;
    }
  }

  private async findProductAny(productId: string): Promise<Product | null> {
    try {
      const product = await this.database.get<Product>('products').find(productId);
      return product;
    } catch {
      return null;
    }
  }
}
