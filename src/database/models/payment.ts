import Model from '@nozbe/watermelondb/Model';

// Metode pembayaran sesuai GLOSSARY.md §2; struktur generik siap QRIS dinamis.
export type PaymentMethod = 'cash' | 'qris' | 'debit' | 'transfer';

export default class Payment extends Model {
  static table = 'payments';

  get transactionId(): string {
    return this._getRaw('transaction_id') as string;
  }

  set transactionId(value: string) {
    this._setRaw('transaction_id', value);
  }

  get method(): PaymentMethod {
    return this._getRaw('method') as PaymentMethod;
  }

  set method(value: PaymentMethod) {
    this._setRaw('method', value);
  }

  get amount(): number {
    return this._getRaw('amount') as number;
  }

  set amount(value: number) {
    this._setRaw('amount', value);
  }

  get reference(): string | null {
    return this._getRaw('reference') as string | null;
  }

  set reference(value: string | null) {
    this._setRaw('reference', value);
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
