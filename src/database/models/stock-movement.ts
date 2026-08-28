import Model from '@nozbe/watermelondb/Model';

export type StockMovementType = 'in' | 'out' | 'adjustment' | 'sale' | 'void' | 'return';

export default class StockMovement extends Model {
  static table = 'stock_movements';

  get productId(): string {
    return this._getRaw('product_id') as string;
  }

  set productId(value: string) {
    this._setRaw('product_id', value);
  }

  get type(): StockMovementType {
    return this._getRaw('type') as StockMovementType;
  }

  set type(value: StockMovementType) {
    this._setRaw('type', value);
  }

  get qty(): number {
    return this._getRaw('qty') as number;
  }

  set qty(value: number) {
    this._setRaw('qty', value);
  }

  get stockBefore(): number {
    return this._getRaw('stock_before') as number;
  }

  set stockBefore(value: number) {
    this._setRaw('stock_before', value);
  }

  get stockAfter(): number {
    return this._getRaw('stock_after') as number;
  }

  set stockAfter(value: number) {
    this._setRaw('stock_after', value);
  }

  get reason(): string | null {
    return this._getRaw('reason') as string | null;
  }

  set reason(value: string | null) {
    this._setRaw('reason', value);
  }

  get refType(): string | null {
    return this._getRaw('ref_type') as string | null;
  }

  set refType(value: string | null) {
    this._setRaw('ref_type', value);
  }

  get refId(): string | null {
    return this._getRaw('ref_id') as string | null;
  }

  set refId(value: string | null) {
    this._setRaw('ref_id', value);
  }

  get userId(): string {
    return this._getRaw('user_id') as string;
  }

  set userId(value: string) {
    this._setRaw('user_id', value);
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
