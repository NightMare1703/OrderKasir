import Model from '@nozbe/watermelondb/Model';

export type ShiftStatus = 'open' | 'closed';

export default class Shift extends Model {
  static table = 'shifts';

  get userId(): string {
    return this._getRaw('user_id') as string;
  }

  set userId(value: string) {
    this._setRaw('user_id', value);
  }

  get openedAt(): number {
    return this._getRaw('opened_at') as number;
  }

  set openedAt(value: number) {
    this._setRaw('opened_at', value);
  }

  get closedAt(): number | null {
    return this._getRaw('closed_at') as number | null;
  }

  set closedAt(value: number | null) {
    this._setRaw('closed_at', value);
  }

  get openingCash(): number {
    return this._getRaw('opening_cash') as number;
  }

  set openingCash(value: number) {
    this._setRaw('opening_cash', value);
  }

  get closingCash(): number | null {
    return this._getRaw('closing_cash') as number | null;
  }

  set closingCash(value: number | null) {
    this._setRaw('closing_cash', value);
  }

  get expectedCash(): number | null {
    return this._getRaw('expected_cash') as number | null;
  }

  set expectedCash(value: number | null) {
    this._setRaw('expected_cash', value);
  }

  get difference(): number | null {
    return this._getRaw('difference') as number | null;
  }

  set difference(value: number | null) {
    this._setRaw('difference', value);
  }

  get status(): ShiftStatus {
    return this._getRaw('status') as ShiftStatus;
  }

  set status(value: ShiftStatus) {
    this._setRaw('status', value);
  }

  get notes(): string | null {
    return this._getRaw('notes') as string | null;
  }

  set notes(value: string | null) {
    this._setRaw('notes', value);
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
