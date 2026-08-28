import { Database, Q } from '@nozbe/watermelondb';

import Product from '../database/models/product';
import StockMovement, { StockMovementType } from '../database/models/stock-movement';
import User from '../database/models/user';

export type { StockMovementType };

export const STOCK_MOVEMENT_TYPES = [
  'in',
  'out',
  'adjustment',
  'sale',
  'void',
  'return',
] as const satisfies readonly StockMovementType[];

const POSITIVE_TYPES = new Set<StockMovementType>(['in', 'void', 'return']);
const NEGATIVE_TYPES = new Set<StockMovementType>(['out', 'sale']);

const isValidType = (value: unknown): value is StockMovementType =>
  typeof value === 'string' &&
  (STOCK_MOVEMENT_TYPES as readonly string[]).includes(value);

export type StockAdjustInput = {
  productId: string;
  type: StockMovementType;
  qty: number;
  reason?: string | null;
  refType?: string | null;
  refId?: string | null;
  userId: string;
  allowNegativeStock?: boolean;
};

export type StockServiceOptions = {
  now?: () => number;
};

export type StockAdjustResult =
  | { status: 'ok'; movement: StockMovement; product: Product }
  | { status: 'product_not_found'; productId: string }
  | { status: 'user_not_found'; userId: string }
  | { status: 'invalid_type'; type: string }
  | { status: 'invalid_qty'; message: string }
  | { status: 'reason_required' }
  | { status: 'negative_stock'; stockBefore: number; stockAfter: number };

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class StockService {
  private readonly database: Database;

  private readonly now: () => number;

  constructor(database: Database, options: StockServiceOptions = {}) {
    this.database = database;
    this.now = options.now ?? Date.now;
  }

  async adjust(input: StockAdjustInput): Promise<StockAdjustResult> {
    const { productId, type, qty, userId } = input;
    const allowNegativeStock = input.allowNegativeStock ?? false;

    if (!isValidType(type)) {
      return { status: 'invalid_type', type: String(type) };
    }

    if (!Number.isInteger(qty) || qty === 0) {
      return { status: 'invalid_qty', message: 'qty_must_be_non_zero_integer' };
    }

    if (POSITIVE_TYPES.has(type) && qty <= 0) {
      return { status: 'invalid_qty', message: 'qty_must_be_positive_for_type' };
    }
    if (NEGATIVE_TYPES.has(type) && qty >= 0) {
      return { status: 'invalid_qty', message: 'qty_must_be_negative_for_type' };
    }

    if (type === 'adjustment') {
      const reason = normalizeOptionalText(input.reason);
      if (reason === null) {
        return { status: 'reason_required' };
      }
    }

    const product = await this.findActiveProduct(productId);
    if (!product) {
      return { status: 'product_not_found', productId };
    }

    const user = await this.findActiveUser(userId);
    if (!user) {
      return { status: 'user_not_found', userId };
    }

    const stockBefore = product.stock;
    const stockAfter = stockBefore + qty;

    if (stockAfter < 0 && !allowNegativeStock) {
      return { status: 'negative_stock', stockBefore, stockAfter };
    }

    const timestamp = this.now();
    const reasonValue = normalizeOptionalText(input.reason);
    const refTypeValue = normalizeOptionalText(input.refType);
    const refIdValue = normalizeOptionalText(input.refId);

    let createdMovement: StockMovement | null = null;

    await this.database.write(async () => {
      createdMovement = await this.database
        .get<StockMovement>('stock_movements')
        .create((record) => {
          record.productId = productId;
          record.type = type;
          record.qty = qty;
          record.stockBefore = stockBefore;
          record.stockAfter = stockAfter;
          record.reason = reasonValue;
          record.refType = refTypeValue;
          record.refId = refIdValue;
          record.userId = userId;
          record.createdAt = timestamp;
          record.updatedAt = timestamp;
          record._setRaw('last_modified', timestamp);
          record._setRaw('deleted', false);
        });

      await product.update((raw) => {
        raw.stock = stockAfter;
        raw.updatedAt = timestamp;
        raw._setRaw('last_modified', timestamp);
      });
    });

    if (!createdMovement) {
      throw new Error('gagal membuat stock_movement');
    }

    return { status: 'ok', movement: createdMovement, product };
  }

  async listMovements(productId?: string): Promise<StockMovement[]> {
    const collection = this.database.get<StockMovement>('stock_movements');
    const clauses: ReturnType<typeof Q.where>[] = [Q.where('deleted', false)];

    if (productId) {
      clauses.push(Q.where('product_id', productId));
    }

    const rows = await collection.query(...clauses).fetch();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
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
