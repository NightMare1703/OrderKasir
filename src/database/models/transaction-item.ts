import Model from '@nozbe/watermelondb/Model';

// Snapshot saat transaksi (PRD §7.4.2): laporan historis tidak join ke products.
export default class TransactionItem extends Model {
  static table = 'transaction_items';

  get transactionId(): string {
    return this._getRaw('transaction_id') as string;
  }

  set transactionId(value: string) {
    this._setRaw('transaction_id', value);
  }

  get productId(): string {
    return this._getRaw('product_id') as string;
  }

  set productId(value: string) {
    this._setRaw('product_id', value);
  }

  get productNameSnapshot(): string {
    return this._getRaw('product_name_snapshot') as string;
  }

  set productNameSnapshot(value: string) {
    this._setRaw('product_name_snapshot', value);
  }

  get unitSnapshot(): string {
    return this._getRaw('unit_snapshot') as string;
  }

  set unitSnapshot(value: string) {
    this._setRaw('unit_snapshot', value);
  }

  get qty(): number {
    return this._getRaw('qty') as number;
  }

  set qty(value: number) {
    this._setRaw('qty', value);
  }

  get unitPrice(): number {
    return this._getRaw('unit_price') as number;
  }

  set unitPrice(value: number) {
    this._setRaw('unit_price', value);
  }

  get discount(): number {
    return this._getRaw('discount') as number;
  }

  set discount(value: number) {
    this._setRaw('discount', value);
  }

  get total(): number {
    return this._getRaw('total') as number;
  }

  set total(value: number) {
    this._setRaw('total', value);
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
