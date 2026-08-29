import Model from '@nozbe/watermelondb/Model';

export default class Customer extends Model {
  static table = 'customers';

  get name(): string {
    return this._getRaw('name') as string;
  }

  set name(value: string) {
    this._setRaw('name', value);
  }

  get phone(): string | null {
    return this._getRaw('phone') as string | null;
  }

  set phone(value: string | null) {
    this._setRaw('phone', value);
  }

  get note(): string | null {
    return this._getRaw('note') as string | null;
  }

  set note(value: string | null) {
    this._setRaw('note', value);
  }

  get debtLimit(): number | null {
    return this._getRaw('debt_limit') as number | null;
  }

  set debtLimit(value: number | null) {
    this._setRaw('debt_limit', value);
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