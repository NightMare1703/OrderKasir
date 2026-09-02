import Model from '@nozbe/watermelondb/Model';

export default class CashDrawerPull extends Model {
  static table = 'cash_drawer_pulls';

  get shiftId(): string {
    return this._getRaw('shift_id') as string;
  }

  set shiftId(value: string) {
    this._setRaw('shift_id', value);
  }

  get amount(): number {
    return this._getRaw('amount') as number;
  }

  set amount(value: number) {
    this._setRaw('amount', value);
  }

  get reason(): string | null {
    return this._getRaw('reason') as string | null;
  }

  set reason(value: string | null) {
    this._setRaw('reason', value);
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
