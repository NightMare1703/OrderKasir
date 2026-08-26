import Model from '@nozbe/watermelondb/Model';

export default class Setting extends Model {
  static table = 'settings';

  get key(): string {
    return this._getRaw('key') as string;
  }

  set key(value: string) {
    this._setRaw('key', value);
  }

  get value(): string {
    return this._getRaw('value') as string;
  }

  set value(value: string) {
    this._setRaw('value', value);
  }
}
