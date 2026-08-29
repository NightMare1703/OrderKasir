import { Database, Q } from '@nozbe/watermelondb';

import Product from '../database/models/product';
import User from '../database/models/user';
import { ProductService } from './ProductService';
import { StockService } from './StockService';
import {
  ProductCsvParseError,
  exportProductsToCsv,
  generateProductCsvTemplate,
  parseProductCsv,
  type ProductCsvExportItem,
  type ProductCsvRow,
} from '../utils/csv';

export type ProductImportRowError = ProductCsvParseError & {
  code: string;
};

export type ProductImportResult = {
  totalRows: number;
  successCount: number;
  failureCount: number;
  createdCount: number;
  warningCount: number;
  errors: ProductImportRowError[];
  successes: Array<{ rowNumber: number; productId: string; warnings: string[] }>;
};

export type ProductImportServiceOptions = {
  now?: () => number;
};

export class ProductImportService {
  private readonly database: Database;

  private readonly productService: ProductService;

  private readonly stockService: StockService;

  constructor(database: Database, options: ProductImportServiceOptions = {}) {
    this.database = database;
    this.productService = new ProductService(database, { now: options.now });
    this.stockService = new StockService(database, { now: options.now });
  }

  getTemplate(): string {
    return generateProductCsvTemplate();
  }

  async exportAll(): Promise<string> {
    const products = await this.productService.listProducts();
    const categories = await this.productService.listCategories();
    const categoryMap = new Map<string, string>();
    categories.forEach((category) => {
      categoryMap.set(category.id, category.name);
    });

    const items: ProductCsvExportItem[] = products.map((product) => ({
      name: product.name,
      barcode: product.barcode,
      categoryName: product.categoryId ? (categoryMap.get(product.categoryId) ?? null) : null,
      unit: product.unit,
      customUnitLabel: product.customUnitLabel,
      costPrice: product.costPrice,
      sellPrice: product.sellPrice,
      stock: product.stock,
      minStock: product.minStock,
      isActive: product.isActive,
    }));

    return exportProductsToCsv(items);
  }

  async importFromCsv(csvText: string, userId: string): Promise<ProductImportResult> {
    const parsed = parseProductCsv(csvText);
    const errors: ProductImportRowError[] = [...parsed.errors.map((error) => ({ ...error, code: error.code }))];
    const successes: Array<{ rowNumber: number; productId: string; warnings: string[] }> = [];

    if (!parsed.headerValid) {
      return {
        totalRows: 0,
        successCount: 0,
        failureCount: errors.length > 0 ? 1 : 0,
        createdCount: 0,
        warningCount: 0,
        errors,
        successes,
      };
    }

    const distinctParseFailedRows = new Set<number>();
    parsed.errors.forEach((error) => {
      if (error.row >= 2) {
        distinctParseFailedRows.add(error.row);
      }
    });
    const totalDataRows = parsed.rows.length + distinctParseFailedRows.size;

    const user = await this.findActiveUser(userId);
    if (!user) {
      errors.push({
        row: 0,
        code: 'user_not_found',
        message: 'User tidak ditemukan atau tidak aktif',
      });
      const failedRows = new Set<number>();
      errors.forEach((error) => {
        if (error.row >= 2) {
          failedRows.add(error.row);
        }
      });
      return {
        totalRows: totalDataRows,
        successCount: 0,
        failureCount: failedRows.size,
        createdCount: 0,
        warningCount: 0,
        errors,
        successes,
      };
    }

    const seenBarcodes = new Set<string>();

    for (const { rowNumber, data } of parsed.rows) {
      const rowResult = await this.importSingleRow(data, rowNumber, seenBarcodes, userId);
      if (rowResult.status === 'ok') {
        successes.push({ rowNumber, productId: rowResult.productId, warnings: rowResult.warnings });
      } else {
        errors.push(...rowResult.errors);
      }
    }

    const warningCount = successes.reduce((sum, item) => sum + item.warnings.length, 0);
    const distinctFailedRows = new Set<number>();
    errors.forEach((error) => {
      if (error.row >= 2) {
        distinctFailedRows.add(error.row);
      }
    });

    return {
      totalRows: totalDataRows,
      successCount: successes.length,
      failureCount: distinctFailedRows.size,
      createdCount: successes.length,
      warningCount,
      errors,
      successes,
    };
  }

  private async importSingleRow(
    row: ProductCsvRow,
    rowNumber: number,
    seenBarcodes: Set<string>,
    userId: string,
  ): Promise<
    | { status: 'ok'; productId: string; warnings: string[] }
    | { status: 'error'; errors: ProductImportRowError[] }
  > {
    const rowErrors: ProductImportRowError[] = [];

    if (row.barcode !== null) {
      const normalized = row.barcode.trim();
      if (seenBarcodes.has(normalized)) {
        rowErrors.push({
          row: rowNumber,
          field: 'barcode',
          code: 'barcode_duplicate_in_file',
          message: `Barcode duplikat di file baris ${rowNumber}`,
        });
        return { status: 'error', errors: rowErrors };
      }
      const existing = await this.findActiveByBarcode(normalized);
      if (existing) {
        rowErrors.push({
          row: rowNumber,
          field: 'barcode',
          code: 'barcode_duplicate',
          message: `Barcode sudah dipakai produk lain`,
        });
        return { status: 'error', errors: rowErrors };
      }
    }

    let categoryId: string | null = null;
    if (row.category !== null) {
      const categoryResult = await this.productService.createCategory(row.category);
      if (categoryResult.status !== 'ok') {
        rowErrors.push({
          row: rowNumber,
          field: 'category',
          code: 'category_invalid',
          message: 'Kategori tidak valid',
        });
        return { status: 'error', errors: rowErrors };
      }
      categoryId = categoryResult.category.id;
    }

    const createResult = await this.productService.create({
      name: row.name,
      barcode: row.barcode,
      categoryId,
      unit: row.unit,
      customUnitLabel: row.customUnitLabel,
      costPrice: row.costPrice,
      sellPrice: row.sellPrice,
      stock: 0,
      minStock: row.minStock,
    });

    if (createResult.status !== 'ok') {
      if (createResult.status === 'barcode_duplicate') {
        rowErrors.push({
          row: rowNumber,
          field: 'barcode',
          code: 'barcode_duplicate',
          message: `Barcode sudah dipakai`,
        });
      } else if (createResult.status === 'validation_failed') {
        createResult.issues.forEach((issue) => {
          rowErrors.push({
            row: rowNumber,
            field: issue.field,
            code: issue.code,
            message: issue.code,
          });
        });
      } else if (createResult.status === 'category_not_found') {
        rowErrors.push({
          row: rowNumber,
          field: 'category',
          code: 'category_not_found',
          message: 'Kategori tidak ditemukan',
        });
      } else {
        rowErrors.push({
          row: rowNumber,
          code: 'create_failed',
          message: 'Gagal membuat produk',
        });
      }
      return { status: 'error', errors: rowErrors };
    }

    if (row.barcode !== null) {
      seenBarcodes.add(row.barcode.trim());
    }

    const product: Product = createResult.product;
    const warnings = [...createResult.warnings];

    if (!row.isActive) {
      await this.database.write(() =>
        product.update((raw) => {
          raw.isActive = false;
        }),
      );
    }

    if (row.stock > 0) {
      const stockResult = await this.stockService.adjust({
        productId: product.id,
        type: 'in',
        qty: row.stock,
        reason: 'Impor CSV',
        refType: 'import',
        refId: `csv-row-${rowNumber}`,
        userId,
      });
      if (stockResult.status !== 'ok') {
        rowErrors.push({
          row: rowNumber,
          field: 'stock',
          code: stockResult.status,
          message: `Gagal mencatat stok: ${stockResult.status}`,
        });
        return { status: 'error', errors: rowErrors };
      }
    }

    return { status: 'ok', productId: product.id, warnings };
  }

  private async findActiveByBarcode(barcode: string): Promise<Product | null> {
    const rows = await this.database
      .get<Product>('products')
      .query(Q.where('barcode', barcode), Q.where('deleted', false))
      .fetch();
    return rows[0] ?? null;
  }

  private async findActiveUser(userId: string): Promise<{ id: string } | null> {
    try {
      const user = await this.database.get<User>('users').find(userId);
      const deleted = user._getRaw('deleted') as boolean | undefined;
      if (deleted) {
        return null;
      }
      return user.isActive ? { id: userId } : null;
    } catch {
      return null;
    }
  }
}

export const buildProductImportService = (database: Database, options: ProductImportServiceOptions = {}): ProductImportService =>
  new ProductImportService(database, options);
