import { Database, Q } from '@nozbe/watermelondb';

import Category from '../database/models/category';
import Product from '../database/models/product';
import {
  ProductCreateInput,
  ProductUpdateInput,
  productCreateSchema,
  productUpdateSchema,
} from '../features/products/schemas';

export type ProductWarning = 'sell_price_below_cost';

export type ProductFieldIssue = { field: string; code: string };

export type ProductWriteResult =
  | { status: 'ok'; product: Product; warnings: ProductWarning[] }
  | { status: 'validation_failed'; issues: ProductFieldIssue[] }
  | { status: 'barcode_duplicate'; barcode: string }
  | { status: 'category_not_found' }
  | { status: 'not_found' };

export type ProductServiceOptions = {
  now?: () => number;
};

const toFieldIssues = (issues: { path: PropertyKey[]; message: string }[]): ProductFieldIssue[] =>
  issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    code: issue.message,
  }));

// Warning non-blocking: harga jual di bawah HPP sah secara bisnis (mis. promo
// rugi), jadi hanya dilaporkan — tidak memblokir simpan (US-10).
const collectWarnings = (costPrice: number, sellPrice: number): ProductWarning[] =>
  sellPrice < costPrice ? ['sell_price_below_cost'] : [];

export class ProductService {
  private readonly database: Database;

  private readonly now: () => number;

  constructor(database: Database, options: ProductServiceOptions = {}) {
    this.database = database;
    this.now = options.now ?? Date.now;
  }

  async create(input: unknown): Promise<ProductWriteResult> {
    const parsed = productCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { status: 'validation_failed', issues: toFieldIssues(parsed.error.issues) };
    }
    const data: ProductCreateInput = parsed.data;

    // Barcode unique sparse ditegakkan di service — WatermelonDB tidak punya
    // constraint UNIQUE di level schema (lihat komentar schema.ts).
    if (data.barcode !== null && (await this.findActiveByBarcode(data.barcode))) {
      return { status: 'barcode_duplicate', barcode: data.barcode };
    }
    if (data.categoryId !== null && !(await this.categoryExists(data.categoryId))) {
      return { status: 'category_not_found' };
    }

    const timestamp = this.now();
    const product = await this.database.write(() =>
      this.database.get<Product>('products').create((raw) => {
        raw.name = data.name;
        raw.barcode = data.barcode;
        raw.categoryId = data.categoryId;
        raw.unit = data.unit;
        raw.photoPath = null;
        raw.costPrice = data.costPrice;
        raw.sellPrice = data.sellPrice;
        raw.stock = data.stock;
        raw.minStock = data.minStock;
        raw.isActive = true;
        raw.createdAt = timestamp;
        raw.updatedAt = timestamp;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', timestamp);
      }),
    );

    return {
      status: 'ok',
      product,
      warnings: collectWarnings(data.costPrice, data.sellPrice),
    };
  }

  async update(productId: string, input: unknown): Promise<ProductWriteResult> {
    const product = await this.findActiveById(productId);
    if (!product) {
      return { status: 'not_found' };
    }

    const parsed = productUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return { status: 'validation_failed', issues: toFieldIssues(parsed.error.issues) };
    }
    const data: ProductUpdateInput = parsed.data;

    if (data.barcode !== null) {
      const existing = await this.findActiveByBarcode(data.barcode);
      if (existing && existing.id !== productId) {
        return { status: 'barcode_duplicate', barcode: data.barcode };
      }
    }
    if (data.categoryId !== null && !(await this.categoryExists(data.categoryId))) {
      return { status: 'category_not_found' };
    }

    const timestamp = this.now();
    await this.database.write(() =>
      product.update((raw) => {
        raw.name = data.name;
        raw.barcode = data.barcode;
        raw.categoryId = data.categoryId;
        raw.unit = data.unit;
        raw.costPrice = data.costPrice;
        raw.sellPrice = data.sellPrice;
        raw.minStock = data.minStock;
        raw.updatedAt = timestamp;
        raw._setRaw('last_modified', timestamp);
      }),
    );

    return {
      status: 'ok',
      product,
      warnings: collectWarnings(data.costPrice, data.sellPrice),
    };
  }

  async softDelete(productId: string): Promise<ProductWriteResult> {
    const product = await this.findActiveById(productId);
    if (!product) {
      return { status: 'not_found' };
    }

    const timestamp = this.now();
    await this.database.write(() =>
      product.update((raw) => {
        raw.updatedAt = timestamp;
        raw._setRaw('deleted', true);
        raw._setRaw('last_modified', timestamp);
      }),
    );
    return { status: 'ok', product, warnings: [] };
  }

  async getById(productId: string): Promise<Product | null> {
    return this.findActiveById(productId);
  }

  async getByBarcode(barcode: string): Promise<Product | null> {
    return this.findActiveByBarcode(barcode);
  }

  private async findActiveById(productId: string): Promise<Product | null> {
    try {
      const product = await this.database.get<Product>('products').find(productId);
      return product._getRaw('deleted') ? null : product;
    } catch {
      return null;
    }
  }

  private async findActiveByBarcode(barcode: string): Promise<Product | null> {
    const rows = await this.database
      .get<Product>('products')
      .query(Q.where('barcode', barcode), Q.where('deleted', false))
      .fetch();
    return rows[0] ?? null;
  }

  private async categoryExists(categoryId: string): Promise<boolean> {
    try {
      const category = await this.database.get<Category>('categories').find(categoryId);
      return !category._getRaw('deleted');
    } catch {
      return false;
    }
  }
}
