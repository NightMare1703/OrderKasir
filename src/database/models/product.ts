import Model from '@nozbe/watermelondb/Model';

// Satuan sesuai PRD §5.5/US-10; 'custom' diisi bebas oleh pengguna.
export type ProductUnit = 'pcs' | 'pack' | 'kg' | 'liter' | 'custom';

export default class Product extends Model {
  static table = 'products';

  get name(): string {
    return this._getRaw('name') as string;
  }

  set name(value: string) {
    this._setRaw('name', value);
  }

  get barcode(): string | null {
    return this._getRaw('barcode') as string | null;
  }

  set barcode(value: string | null) {
    this._setRaw('barcode', value);
  }

  get categoryId(): string | null {
    return this._getRaw('category_id') as string | null;
  }

  set categoryId(value: string | null) {
    this._setRaw('category_id', value);
  }

  get unit(): ProductUnit {
    return this._getRaw('unit') as ProductUnit;
  }

  set unit(value: ProductUnit) {
    this._setRaw('unit', value);
  }

  // Semua uang = integer rupiah (AGENTS.md §3).
  get costPrice(): number {
    return this._getRaw('cost_price') as number;
  }

  set costPrice(value: number) {
    this._setRaw('cost_price', value);
  }

  get sellPrice(): number {
    return this._getRaw('sell_price') as number;
  }

  set sellPrice(value: number) {
    this._setRaw('sell_price', value);
  }

  // HANYA boleh berubah via StockService (AGENTS.md §4.2).
  get stock(): number {
    return this._getRaw('stock') as number;
  }

  set stock(value: number) {
    this._setRaw('stock', value);
  }

  get minStock(): number {
    return this._getRaw('min_stock') as number;
  }

  set minStock(value: number) {
    this._setRaw('min_stock', value);
  }

  get isActive(): boolean {
    return this._getRaw('is_active') as boolean;
  }

  set isActive(value: boolean) {
    this._setRaw('is_active', value);
  }

  get photoPath(): string | null {
    return this._getRaw('photo_path') as string | null;
  }

  set photoPath(value: string | null) {
    this._setRaw('photo_path', value);
  }

  get createdAt(): number {
    return this._getRaw('created_at') as number;
  }

  set createdAt(value: number) {
    this._setRaw('created_at', value);
  }

  get updatedAt(): number {
    return this._getRaw('updated_at') as number;
  }

  set updatedAt(value: number) {
    this._setRaw('updated_at', value);
  }
}
