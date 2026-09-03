import { Database, Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';

import Category from '../database/models/category';
import Customer from '../database/models/customer';
import Debt from '../database/models/debt';
import Payment, { PaymentMethod } from '../database/models/payment';
import Product from '../database/models/product';
import Transaction from '../database/models/transaction';
import TransactionItem from '../database/models/transaction-item';

export const PROFIT_LABEL = 'laba kotor estimasi';

export type DateRange = {
  start: number;
  end: number;
};

export type SalesReport = {
  omzet: number;
  transactionCount: number;
  averageBasket: number;
  discountTotal: number;
  taxTotal: number;
};

export type PaymentBreakdown = {
  cash: number;
  qris: number;
  debit: number;
  transfer: number;
  total: number;
};

export type TopProduct = {
  productId: string;
  productName: string;
  qty: number;
  revenue: number;
  costEstimate: number;
  profitEstimate: number;
  categoryId: string | null;
};

export type ProfitReport = {
  label: typeof PROFIT_LABEL;
  omzet: number;
  costTotalEstimate: number;
  grossProfitEstimate: number;
  marginPercent: number | null;
  perProduct: TopProduct[];
  perCategory: Array<{
    categoryId: string | null;
    categoryName: string;
    qty: number;
    revenue: number;
    costEstimate: number;
    profitEstimate: number;
  }>;
};

export type InventoryReport = {
  totalValue: number;
  totalSku: number;
  totalUnits: number;
  lowStockCount: number;
  lowStockProducts: Product[];
  categoryValues: Array<{
    categoryId: string | null;
    categoryName: string;
    value: number;
    skuCount: number;
    unitCount: number;
  }>;
};

export type DebtAgingBucketKey =
  | 'noDueDate'
  | 'future'
  | 'dueToday'
  | 'overdue1to7'
  | 'overdue8to30'
  | 'overdueOver30';

export type DebtAgingBucket = {
  key: DebtAgingBucketKey;
  label: string;
  count: number;
  outstanding: number;
};

export type DebtAgingReport = {
  totalOutstanding: number;
  outstandingCount: number;
  buckets: DebtAgingBucket[];
  perCustomer: Array<{
    customerId: string;
    customerName: string | null;
    outstanding: number;
    debtCount: number;
  }>;
};

export type ReportServiceOptions = {
  now?: () => number;
};

const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'qris', 'debit', 'transfer'];

const normalizeRange = (range: DateRange): DateRange => {
  if (range.start > range.end) {
    return { start: range.end, end: range.start };
  }
  return range;
};

export class ReportService {
  private readonly database: Database;

  private readonly now: () => number;

  constructor(database: Database, options: ReportServiceOptions = {}) {
    this.database = database;
    this.now = options.now ?? Date.now;
  }

  async getSalesReport(range: DateRange): Promise<SalesReport> {
    const { start, end } = normalizeRange(range);
    const transactions = await this.getTransactionsInRange(start, end);
    let omzet = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    for (const trx of transactions) {
      omzet += trx.total;
      discountTotal += trx.discount;
      taxTotal += trx.tax;
    }
    const transactionCount = transactions.length;
    const averageBasket = transactionCount > 0 ? Math.floor(omzet / transactionCount) : 0;
    return { omzet, transactionCount, averageBasket, discountTotal, taxTotal };
  }

  async getPaymentBreakdown(range: DateRange): Promise<PaymentBreakdown> {
    const { start, end } = normalizeRange(range);
    const transactions = await this.getTransactionsInRange(start, end);
    const validIds = transactions.map((trx) => trx.id);
    const breakdown: PaymentBreakdown = { cash: 0, qris: 0, debit: 0, transfer: 0, total: 0 };
    if (validIds.length === 0) {
      return breakdown;
    }
    const payments = await this.database
      .get<Payment>('payments')
      .query(Q.where('deleted', false), Q.where('transaction_id', Q.oneOf(validIds)))
      .fetch();
    for (const payment of payments) {
      const method = payment.method as PaymentMethod;
      if ((PAYMENT_METHODS as readonly string[]).includes(method)) {
        breakdown[method] += payment.amount;
      }
      breakdown.total += payment.amount;
    }
    return breakdown;
  }

  async getTopProducts(range: DateRange, limit = 10): Promise<TopProduct[]> {
    const { start, end } = normalizeRange(range);
    const transactions = await this.getTransactionsInRange(start, end);
    const validIds = transactions.map((trx) => trx.id);
    if (validIds.length === 0) {
      return [];
    }
    const items = await this.database
      .get<TransactionItem>('transaction_items')
      .query(Q.where('deleted', false), Q.where('transaction_id', Q.oneOf(validIds)))
      .fetch();

    const productMap = await this.getProductMap();

    const aggregated = new Map<
      string,
      { productName: string; qty: number; revenue: number; categoryId: string | null }
    >();
    for (const item of items) {
      const existing = aggregated.get(item.productId);
      if (existing) {
        existing.qty += item.qty;
        existing.revenue += item.total;
      } else {
        aggregated.set(item.productId, {
          productName: item.productNameSnapshot,
          qty: item.qty,
          revenue: item.total,
          categoryId: productMap.get(item.productId)?.categoryId ?? null,
        });
      }
    }

    const result: TopProduct[] = [];
    for (const [productId, data] of aggregated) {
      const product = productMap.get(productId) ?? null;
      const costEstimate = product ? data.qty * product.costPrice : 0;
      const profitEstimate = data.revenue - costEstimate;
      result.push({
        productId,
        productName: data.productName,
        qty: data.qty,
        revenue: data.revenue,
        costEstimate,
        profitEstimate,
        categoryId: data.categoryId,
      });
    }

    result.sort((a, b) => {
      if (b.qty !== a.qty) return b.qty - a.qty;
      return b.revenue - a.revenue;
    });

    return result.slice(0, limit);
  }

  async getProfitReport(range: DateRange): Promise<ProfitReport> {
    const { start, end } = normalizeRange(range);
    const sales = await this.getSalesReport(range);
    const omzet = sales.omzet;

    const transactions = await this.getTransactionsInRange(start, end);
    const validIds = transactions.map((trx) => trx.id);
    let costTotalEstimate = 0;
    const perProductMap = new Map<
      string,
      { productName: string; qty: number; revenue: number; categoryId: string | null }
    >();
    const perCategoryMap = new Map<
      string | null,
      { categoryName: string; qty: number; revenue: number; costEstimate: number }
    >();

    if (validIds.length > 0) {
      const items = await this.database
        .get<TransactionItem>('transaction_items')
        .query(Q.where('deleted', false), Q.where('transaction_id', Q.oneOf(validIds)))
        .fetch();
      const productMap = await this.getProductMap();
      const categoryMap = await this.getCategoryMap();

      for (const item of items) {
        const product = productMap.get(item.productId) ?? null;
        const cost = product ? item.qty * product.costPrice : 0;
        costTotalEstimate += cost;

        const agg = perProductMap.get(item.productId);
        if (agg) {
          agg.qty += item.qty;
          agg.revenue += item.total;
        } else {
          perProductMap.set(item.productId, {
            productName: item.productNameSnapshot,
            qty: item.qty,
            revenue: item.total,
            categoryId: product?.categoryId ?? null,
          });
        }

        const catId = product?.categoryId ?? null;
        const catName = catId ? categoryMap.get(catId) ?? 'Tanpa Kategori' : 'Tanpa Kategori';
        const catAgg = perCategoryMap.get(catId);
        if (catAgg) {
          catAgg.qty += item.qty;
          catAgg.revenue += item.total;
          catAgg.costEstimate += cost;
        } else {
          perCategoryMap.set(catId, {
            categoryName: catName,
            qty: item.qty,
            revenue: item.total,
            costEstimate: cost,
          });
        }
      }
    }

    const grossProfitEstimate = omzet - costTotalEstimate;
    const marginPercent = omzet > 0 ? Math.round((grossProfitEstimate / omzet) * 10000) / 100 : null;

    const perProduct: TopProduct[] = [];
    const productMap = await this.getProductMap();
    for (const [productId, data] of perProductMap) {
      const product = productMap.get(productId) ?? null;
      const costEstimate = product ? data.qty * product.costPrice : 0;
      perProduct.push({
        productId,
        productName: data.productName,
        qty: data.qty,
        revenue: data.revenue,
        costEstimate,
        profitEstimate: data.revenue - costEstimate,
        categoryId: data.categoryId,
      });
    }
    perProduct.sort((a, b) => b.revenue - a.revenue);

    const perCategory = Array.from(perCategoryMap.entries()).map(([categoryId, data]) => ({
      categoryId,
      categoryName: data.categoryName,
      qty: data.qty,
      revenue: data.revenue,
      costEstimate: data.costEstimate,
      profitEstimate: data.revenue - data.costEstimate,
    }));
    perCategory.sort((a, b) => b.revenue - a.revenue);

    return {
      label: PROFIT_LABEL,
      omzet,
      costTotalEstimate,
      grossProfitEstimate,
      marginPercent,
      perProduct,
      perCategory,
    };
  }

  async getInventoryReport(): Promise<InventoryReport> {
    const products = await this.database
      .get<Product>('products')
      .query(Q.where('deleted', false))
      .fetch();

    let totalValue = 0;
    let totalUnits = 0;
    const lowStockProducts: Product[] = [];
    const categoryTotals = new Map<
      string | null,
      { value: number; skuCount: number; unitCount: number }
    >();
    const categoryMap = await this.getCategoryMap();

    for (const product of products) {
      const value = product.stock * product.costPrice;
      totalValue += value;
      totalUnits += product.stock;
      if (product.stock <= product.minStock) {
        lowStockProducts.push(product);
      }
      const catId = product.categoryId ?? null;
      const existing = categoryTotals.get(catId);
      if (existing) {
        existing.value += value;
        existing.skuCount += 1;
        existing.unitCount += product.stock;
      } else {
        categoryTotals.set(catId, { value, skuCount: 1, unitCount: product.stock });
      }
    }

    const categoryValues = Array.from(categoryTotals.entries()).map(([categoryId, data]) => ({
      categoryId,
      categoryName: categoryId ? categoryMap.get(categoryId) ?? 'Tanpa Kategori' : 'Tanpa Kategori',
      value: data.value,
      skuCount: data.skuCount,
      unitCount: data.unitCount,
    }));
    categoryValues.sort((a, b) => b.value - a.value);

    return {
      totalValue,
      totalSku: products.length,
      totalUnits,
      lowStockCount: lowStockProducts.length,
      lowStockProducts,
      categoryValues,
    };
  }

  async getDebtAgingReport(nowMs?: number): Promise<DebtAgingReport> {
    const now = nowMs ?? this.now();
    const dayStart = dayjs(now).startOf('day').valueOf();
    const dayEnd = dayjs(now).endOf('day').valueOf();

    const debts = await this.database
      .get<Debt>('debts')
      .query(Q.where('deleted', false))
      .fetch();
    const outstanding = debts.filter((debt) => debt.status !== 'paid');

    let totalOutstanding = 0;
    for (const debt of outstanding) {
      totalOutstanding += debt.totalAmount - debt.paidAmount;
    }

    const buckets: DebtAgingBucket[] = [
      { key: 'noDueDate', label: 'Tanpa jatuh tempo', count: 0, outstanding: 0 },
      { key: 'future', label: 'Belum jatuh tempo', count: 0, outstanding: 0 },
      { key: 'dueToday', label: 'Jatuh tempo hari ini', count: 0, outstanding: 0 },
      { key: 'overdue1to7', label: 'Terlambat 1-7 hari', count: 0, outstanding: 0 },
      { key: 'overdue8to30', label: 'Terlambat 8-30 hari', count: 0, outstanding: 0 },
      { key: 'overdueOver30', label: 'Terlambat >30 hari', count: 0, outstanding: 0 },
    ];
    const bucketMap = new Map<DebtAgingBucketKey, DebtAgingBucket>(buckets.map((b) => [b.key, b]));

    const perCustomerMap = new Map<
      string,
      { outstanding: number; debtCount: number }
    >();

    for (const debt of outstanding) {
      const remaining = debt.totalAmount - debt.paidAmount;
      const due = debt.dueDate;

      let key: DebtAgingBucketKey;
      if (due === null) {
        key = 'noDueDate';
      } else if (due > dayEnd) {
        key = 'future';
      } else if (due >= dayStart && due <= dayEnd) {
        key = 'dueToday';
      } else {
        const diffDays = Math.floor((dayStart - due) / (24 * 60 * 60 * 1000));
        if (diffDays >= 1 && diffDays <= 7) {
          key = 'overdue1to7';
        } else if (diffDays >= 8 && diffDays <= 30) {
          key = 'overdue8to30';
        } else {
          key = 'overdueOver30';
        }
      }

      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.outstanding += remaining;
      }

      const existing = perCustomerMap.get(debt.customerId);
      if (existing) {
        existing.outstanding += remaining;
        existing.debtCount += 1;
      } else {
        perCustomerMap.set(debt.customerId, { outstanding: remaining, debtCount: 1 });
      }
    }

    const customerIds = Array.from(perCustomerMap.keys());
    const customerNameMap = new Map<string, string | null>();
    for (const customerId of customerIds) {
      try {
        const customer = await this.database.get<Customer>('customers').find(customerId);
        const deleted = customer._getRaw('deleted') as boolean | undefined;
        customerNameMap.set(customerId, deleted ? null : customer.name);
      } catch {
        customerNameMap.set(customerId, null);
      }
    }

    const perCustomer = Array.from(perCustomerMap.entries())
      .map(([customerId, data]) => ({
        customerId,
        customerName: customerNameMap.get(customerId) ?? null,
        outstanding: data.outstanding,
        debtCount: data.debtCount,
      }))
      .sort((a, b) => b.outstanding - a.outstanding);

    return {
      totalOutstanding,
      outstandingCount: outstanding.length,
      buckets,
      perCustomer,
    };
  }

  async getDailySalesTrend(range: DateRange): Promise<Array<{ date: string; omzet: number; transactionCount: number }>> {
    const { start, end } = normalizeRange(range);
    const transactions = await this.getTransactionsInRange(start, end);
    const byDate = new Map<string, { omzet: number; transactionCount: number }>();
    const cursor = dayjs(start).startOf('day');
    const last = dayjs(end).startOf('day');
    for (
      let d = cursor.clone();
      d.valueOf() <= last.valueOf();
      d = d.add(1, 'day')
    ) {
      const key = d.format('YYYY-MM-DD');
      byDate.set(key, { omzet: 0, transactionCount: 0 });
    }
    for (const trx of transactions) {
      const key = dayjs(trx.createdAt).format('YYYY-MM-DD');
      const bucket = byDate.get(key);
      if (bucket) {
        bucket.omzet += trx.total;
        bucket.transactionCount += 1;
      } else {
        byDate.set(key, { omzet: trx.total, transactionCount: 1 });
      }
    }
    return Array.from(byDate.entries()).map(([date, data]) => ({
      date,
      omzet: data.omzet,
      transactionCount: data.transactionCount,
    }));
  }

  private async getTransactionsInRange(start: number, end: number): Promise<Transaction[]> {
    const all = await this.database
      .get<Transaction>('transactions')
      .query(Q.where('deleted', false))
      .fetch();
    return all.filter(
      (trx) => trx.status !== 'void' && trx.createdAt >= start && trx.createdAt <= end,
    );
  }

  private async getProductMap(): Promise<Map<string, Product>> {
    const products = await this.database
      .get<Product>('products')
      .query(Q.where('deleted', false))
      .fetch();
    return new Map(products.map((product) => [product.id, product]));
  }

  private async getCategoryMap(): Promise<Map<string, string>> {
    const categories = await this.database
      .get<Category>('categories')
      .query(Q.where('deleted', false))
      .fetch();
    return new Map(categories.map((cat) => [cat.id, cat.name]));
  }
}
