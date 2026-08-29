import { Database, Q } from '@nozbe/watermelondb';

import Payment, { PaymentMethod } from '../database/models/payment';
import Product from '../database/models/product';
import StockMovement from '../database/models/stock-movement';
import Transaction, { TransactionStatus } from '../database/models/transaction';
import TransactionItem from '../database/models/transaction-item';
import User from '../database/models/user';
import {
  buildInvoiceNo,
  formatInvoiceDate,
  INVOICE_MAX_SEQUENCE,
  invoiceSequenceOf,
} from '../utils/invoice';

export type { PaymentMethod };

export const PAYMENT_METHODS = [
  'cash',
  'qris',
  'debit',
  'transfer',
] as const satisfies readonly PaymentMethod[];

// Checkout v1 hanya membuat transaksi berstatus paid/debt; void adalah alur
// terpisah (T1.12) karena membutuhkan alasan + PIN admin.
export type CheckoutStatus = Exclude<TransactionStatus, 'void'>;

const isValidPaymentMethod = (value: unknown): value is PaymentMethod =>
  typeof value === 'string' &&
  (PAYMENT_METHODS as readonly string[]).includes(value);

export type CheckoutItemInput = {
  productId: string;
  qty: number;
  unitPrice: number;
  discount: number;
};

export type CheckoutPaymentInput = {
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
};

export type CheckoutInput = {
  shiftId: string;
  userId: string;
  customerId?: string | null;
  items: CheckoutItemInput[];
  transactionDiscount: number;
  tax: number;
  payments: CheckoutPaymentInput[];
  status: CheckoutStatus;
};

export type CheckoutResult =
  | { status: 'ok'; transaction: Transaction; invoiceNo: string }
  | { status: 'empty_cart' }
  | { status: 'invalid_status'; value: string }
  | { status: 'invalid_shift' }
  | { status: 'invalid_item'; index: number; code: string }
  | { status: 'invalid_transaction_discount' }
  | { status: 'invalid_tax' }
  | { status: 'invalid_payment'; index: number; code: string }
  | { status: 'payment_total_mismatch'; expected: number; actual: number }
  | { status: 'customer_required' }
  | { status: 'product_not_found'; productId: string }
  | { status: 'insufficient_stock'; productId: string; stock: number; requested: number }
  | { status: 'user_not_found'; userId: string }
  | { status: 'invoice_limit_reached' };

export type CheckoutServiceOptions = {
  now?: () => number;
};

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const isNonEmptyId = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim() !== '';

// Snapshot satuan sesuai GLOSSARY.md §3: unit custom tampil sebagai labelnya.
const unitSnapshotOf = (product: Product): string =>
  product.unit === 'custom' ? product.customUnitLabel ?? 'custom' : product.unit;

export class CheckoutService {
  private readonly database: Database;

  private readonly now: () => number;

  constructor(database: Database, options: CheckoutServiceOptions = {}) {
    this.database = database;
    this.now = options.now ?? Date.now;
  }

  async checkout(input: CheckoutInput): Promise<CheckoutResult> {
    const { shiftId, userId, items, status } = input;
    const customerId = normalizeOptionalText(input.customerId);

    if (status !== 'paid' && status !== 'debt') {
      return { status: 'invalid_status', value: String(status) };
    }

    if (!isNonEmptyId(shiftId)) {
      return { status: 'invalid_shift' };
    }

    if (items.length === 0) {
      return { status: 'empty_cart' };
    }

    let subtotal = 0;
    let itemDiscountTotal = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!isNonEmptyId(item.productId)) {
        return { status: 'invalid_item', index, code: 'invalid_product_id' };
      }
      if (!Number.isInteger(item.qty) || item.qty <= 0) {
        return { status: 'invalid_item', index, code: 'invalid_qty' };
      }
      if (!Number.isInteger(item.unitPrice) || item.unitPrice < 0) {
        return { status: 'invalid_item', index, code: 'invalid_unit_price' };
      }
      if (
        !Number.isInteger(item.discount) ||
        item.discount < 0 ||
        item.discount > item.qty * item.unitPrice
      ) {
        return { status: 'invalid_item', index, code: 'invalid_discount' };
      }
      subtotal += item.qty * item.unitPrice;
      itemDiscountTotal += item.discount;
    }

    const afterItemDiscount = subtotal - itemDiscountTotal;
    if (
      !Number.isInteger(input.transactionDiscount) ||
      input.transactionDiscount < 0 ||
      input.transactionDiscount > afterItemDiscount
    ) {
      return { status: 'invalid_transaction_discount' };
    }

    if (!Number.isInteger(input.tax) || input.tax < 0) {
      return { status: 'invalid_tax' };
    }

    const total = afterItemDiscount - input.transactionDiscount + input.tax;

    let paymentsTotal = 0;
    if (input.payments.length > 3) {
      return { status: 'invalid_payment', index: 3, code: 'too_many_methods' };
    }
    for (let index = 0; index < input.payments.length; index += 1) {
      const payment = input.payments[index];
      if (!isValidPaymentMethod(payment.method)) {
        return { status: 'invalid_payment', index, code: 'invalid_method' };
      }
      if (!Number.isInteger(payment.amount) || payment.amount <= 0) {
        return { status: 'invalid_payment', index, code: 'invalid_amount' };
      }
      paymentsTotal += payment.amount;
    }

    if (status === 'paid' && paymentsTotal !== total) {
      return {
        status: 'payment_total_mismatch',
        expected: total,
        actual: paymentsTotal,
      };
    }
    if (status === 'debt') {
      if (customerId === null) {
        return { status: 'customer_required' };
      }
      if (paymentsTotal > total) {
        return {
          status: 'payment_total_mismatch',
          expected: total,
          actual: paymentsTotal,
        };
      }
    }

    const user = await this.findActiveUser(userId);
    if (!user) {
      return { status: 'user_not_found', userId };
    }

    // Validasi & snapshot produk SEBELUM write: semua item harus lolos agar
    // tidak ada partial write (AGENTS.md §4.4).
    const requiredQty = new Map<string, number>();
    for (const item of items) {
      requiredQty.set(item.productId, (requiredQty.get(item.productId) ?? 0) + item.qty);
    }

    const productMap = new Map<string, Product>();
    for (const [productId, requested] of requiredQty) {
      const product = await this.findActiveProduct(productId);
      if (!product) {
        return { status: 'product_not_found', productId };
      }
      if (product.stock < requested) {
        return {
          status: 'insufficient_stock',
          productId,
          stock: product.stock,
          requested,
        };
      }
      productMap.set(productId, product);
    }

    const timestamp = this.now();
    const invoiceNo = await this.nextInvoiceNo(timestamp);
    if (invoiceNo === null) {
      return { status: 'invoice_limit_reached' };
    }

    let createdTransaction: Transaction | null = null;

    // Satu transaksi DB tunggal: transaction + items + payments + movements +
    // update stok. Gagal satu langkah = rollback seluruhnya (WatermelonDB).
    await this.database.write(async () => {
      createdTransaction = await this.database
        .get<Transaction>('transactions')
        .create((raw) => {
          raw.invoiceNo = invoiceNo;
          raw.shiftId = shiftId;
          raw.userId = userId;
          raw.customerId = customerId;
          raw.subtotal = subtotal;
          raw.discount = input.transactionDiscount;
          raw.tax = input.tax;
          raw.total = total;
          raw.status = status;
          raw.voidReason = null;
          raw.voidByUserId = null;
          raw.createdAt = timestamp;
          raw.updatedAt = timestamp;
          raw._setRaw('deleted', false);
          raw._setRaw('last_modified', timestamp);
        });

      const duplicates = await this.database
        .get<Transaction>('transactions')
        .query(Q.where('invoice_no', invoiceNo))
        .fetch();
      if (duplicates.length > 1) {
        throw new Error(`duplikat invoice_no terdeteksi: ${invoiceNo}`);
      }

      for (const item of items) {
        await this.database.get<TransactionItem>('transaction_items').create((raw) => {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new Error('produk hilang saat menulis item transaksi');
          }
          raw.transactionId = createdTransaction!.id;
          raw.productId = item.productId;
          raw.productNameSnapshot = product.name;
          raw.unitSnapshot = unitSnapshotOf(product);
          raw.qty = item.qty;
          raw.unitPrice = item.unitPrice;
          raw.discount = item.discount;
          raw.total = item.qty * item.unitPrice - item.discount;
          raw.createdAt = timestamp;
          raw.updatedAt = timestamp;
          raw._setRaw('deleted', false);
          raw._setRaw('last_modified', timestamp);
        });
      }

      for (const payment of input.payments) {
        await this.database.get<Payment>('payments').create((raw) => {
          raw.transactionId = createdTransaction!.id;
          raw.method = payment.method;
          raw.amount = payment.amount;
          raw.reference = normalizeOptionalText(payment.reference);
          raw.createdAt = timestamp;
          raw.updatedAt = timestamp;
          raw._setRaw('deleted', false);
          raw._setRaw('last_modified', timestamp);
        });
      }

      // Stok ditulis langsung di sini (bukan lewat StockService.adjust) karena
      // atomicity §4.4 menuntut satu transaksi DB; adjust punya write sendiri.
      for (const [productId, requested] of requiredQty) {
        const product = productMap.get(productId)!;
        const stockBefore = product.stock;
        const stockAfter = stockBefore - requested;

        await this.database.get<StockMovement>('stock_movements').create((raw) => {
          raw.productId = productId;
          raw.type = 'sale';
          raw.qty = -requested;
          raw.stockBefore = stockBefore;
          raw.stockAfter = stockAfter;
          raw.reason = null;
          raw.refType = 'transaction';
          raw.refId = invoiceNo;
          raw.userId = userId;
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

    if (!createdTransaction) {
      throw new Error('gagal membuat transaksi');
    }

    return { status: 'ok', transaction: createdTransaction, invoiceNo };
  }

  private async nextInvoiceNo(timestamp: number): Promise<string | null> {
    const dateString = formatInvoiceDate(timestamp);
    const prefix = `INV-${dateString}-`;
    const rows = await this.database
      .get<Transaction>('transactions')
      .query(Q.where('invoice_no', Q.like(`${prefix}%`)))
      .fetch();

    let maxSequence = 0;
    for (const row of rows) {
      const sequence = invoiceSequenceOf(row.invoiceNo);
      if (sequence !== null && sequence > maxSequence) {
        maxSequence = sequence;
      }
    }

    if (maxSequence >= INVOICE_MAX_SEQUENCE) {
      return null;
    }
    return buildInvoiceNo(dateString, maxSequence + 1);
  }

  private async findActiveProduct(productId: string): Promise<Product | null> {
    try {
      const product = await this.database.get<Product>('products').find(productId);
      return product._getRaw('deleted') ? null : product;
    } catch {
      return null;
    }
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
