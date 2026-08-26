import Model from '@nozbe/watermelondb/Model';

export type UserRole = 'admin' | 'kasir';

export default class User extends Model {
  static table = 'users';

  get name(): string {
    return this._getRaw('name') as string;
  }

  set name(value: string) {
    this._setRaw('name', value);
  }

  get pinHash(): string {
    return this._getRaw('pin_hash') as string;
  }

  set pinHash(value: string) {
    this._setRaw('pin_hash', value);
  }

  get role(): UserRole {
    return this._getRaw('role') as UserRole;
  }

  set role(value: UserRole) {
    this._setRaw('role', value);
  }

  get isActive(): boolean {
    return this._getRaw('is_active') as boolean;
  }

  set isActive(value: boolean) {
    this._setRaw('is_active', value);
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
