import Model from '@nozbe/watermelondb/Model';

export type TransactionStatus = 'paid' | 'void' | 'debt';

// Transaksi immutable (AGENTS.md §4.3): baris hanya di-insert, tidak di-update;
// koreksi lewat void + transaksi baru (T1.12).
export default class Transaction extends Model {
  static table = 'transactions';

  get invoiceNo(): string {
    return this._getRaw('invoice_no') as string;
  }

  set invoiceNo(value: string) {
    this._setRaw('invoice_no', value);
  }

  get shiftId(): string {
    return this._getRaw('shift_id') as string;
  }

  set shiftId(value: string) {
    this._setRaw('shift_id', value);
  }

  get userId(): string {
    return this._getRaw('user_id') as string;
  }

  set userId(value: string) {
    this._setRaw('user_id', value);
  }

  get customerId(): string | null {
    return this._getRaw('customer_id') as string | null;
  }

  set customerId(value: string | null) {
    this._setRaw('customer_id', value);
  }

  get subtotal(): number {
    return this._getRaw('subtotal') as number;
  }

  set subtotal(value: number) {
    this._setRaw('subtotal', value);
  }

  get discount(): number {
    return this._getRaw('discount') as number;
  }

  set discount(value: number) {
    this._setRaw('discount', value);
  }

  get tax(): number {
    return this._getRaw('tax') as number;
  }

  set tax(value: number) {
    this._setRaw('tax', value);
  }

  get total(): number {
    return this._getRaw('total') as number;
  }

  set total(value: number) {
    this._setRaw('total', value);
  }

  get status(): TransactionStatus {
    return this._getRaw('status') as TransactionStatus;
  }

  set status(value: TransactionStatus) {
    this._setRaw('status', value);
  }

  get voidReason(): string | null {
    return this._getRaw('void_reason') as string | null;
  }

  set voidReason(value: string | null) {
    this._setRaw('void_reason', value);
  }

  get voidByUserId(): string | null {
    return this._getRaw('void_by_user_id') as string | null;
  }

  set voidByUserId(value: string | null) {
    this._setRaw('void_by_user_id', value);
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
