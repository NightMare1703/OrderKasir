import Model from '@nozbe/watermelondb/Model';

import type { PaymentMethod } from './payment';

export default class DebtPayment extends Model {
  static table = 'debt_payments';

  get debtId(): string {
    return this._getRaw('debt_id') as string;
  }

  set debtId(value: string) {
    this._setRaw('debt_id', value);
  }

  get amount(): number {
    return this._getRaw('amount') as number;
  }

  set amount(value: number) {
    this._setRaw('amount', value);
  }

  get method(): PaymentMethod {
    return this._getRaw('method') as PaymentMethod;
  }

  set method(value: PaymentMethod) {
    this._setRaw('method', value);
  }

  get reference(): string | null {
    return this._getRaw('reference') as string | null;
  }

  set reference(value: string | null) {
    this._setRaw('reference', value);
  }

  get userId(): string {
    return this._getRaw('user_id') as string;
  }

  set userId(value: string) {
    this._setRaw('user_id', value);
  }

  get shiftId(): string {
    return this._getRaw('shift_id') as string;
  }

  set shiftId(value: string) {
    this._setRaw('shift_id', value);
  }

  get paidAt(): number {
    return this._getRaw('paid_at') as number;
  }

  set paidAt(value: number) {
    this._setRaw('paid_at', value);
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
