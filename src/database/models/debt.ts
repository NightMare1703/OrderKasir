import Model from '@nozbe/watermelondb/Model';

export type DebtStatus = 'open' | 'partial' | 'paid';

export default class Debt extends Model {
  static table = 'debts';

  get transactionId(): string {
    return this._getRaw('transaction_id') as string;
  }

  set transactionId(value: string) {
    this._setRaw('transaction_id', value);
  }

  get customerId(): string {
    return this._getRaw('customer_id') as string;
  }

  set customerId(value: string) {
    this._setRaw('customer_id', value);
  }

  get totalAmount(): number {
    return this._getRaw('total_amount') as number;
  }

  set totalAmount(value: number) {
    this._setRaw('total_amount', value);
  }

  get paidAmount(): number {
    return this._getRaw('paid_amount') as number;
  }

  set paidAmount(value: number) {
    this._setRaw('paid_amount', value);
  }

  get dueDate(): number | null {
    return this._getRaw('due_date') as number | null;
  }

  set dueDate(value: number | null) {
    this._setRaw('due_date', value);
  }

  get status(): DebtStatus {
    return this._getRaw('status') as DebtStatus;
  }

  set status(value: DebtStatus) {
    this._setRaw('status', value);
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
