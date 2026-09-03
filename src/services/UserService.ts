import { Database, Q } from '@nozbe/watermelondb';

import User, { UserRole } from '../database/models/user';
import { AuthService } from './AuthService';

export const USER_ROLES: readonly UserRole[] = ['admin', 'kasir'] as const;

export type CreateUserInput = {
  name: string;
  pin: string;
  role: UserRole;
  isActive?: boolean;
};

export type UpdateUserInput = {
  name?: string;
  pin?: string | null;
  role?: UserRole;
  isActive?: boolean;
};

export type CreateUserResult =
  | { status: 'ok'; user: User }
  | { status: 'invalid_name'; message: string }
  | { status: 'invalid_pin'; message: string }
  | { status: 'invalid_role'; message: string };

export type UpdateUserResult =
  | { status: 'ok'; user: User }
  | { status: 'user_not_found' }
  | { status: 'invalid_name'; message: string }
  | { status: 'invalid_pin'; message: string }
  | { status: 'invalid_role'; message: string }
  | { status: 'cannot_disable_last_admin'; message: string }
  | { status: 'cannot_change_last_admin_role'; message: string };

export type UserServiceOptions = {
  now?: () => number;
  authService?: AuthService;
};

const isValidName = (name: string): boolean => {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 100;
};

export class UserService {
  private readonly database: Database;

  private readonly authService: AuthService;

  private readonly now: () => number;

  constructor(database: Database, options: UserServiceOptions = {}) {
    this.database = database;
    this.authService = options.authService ?? new AuthService(database, { now: options.now });
    this.now = options.now ?? Date.now;
  }

  async listUsers(includeInactive = true): Promise<User[]> {
    const clauses: ReturnType<typeof Q.where>[] = [Q.where('deleted', false)];
    const rows = await this.database.get<User>('users').query(...clauses).fetch();
    const filtered = includeInactive
      ? rows
      : rows.filter((u) => u.isActive);
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findUser(id: string): Promise<User | null> {
    try {
      const user = await this.database.get<User>('users').find(id);
      return user._getRaw('deleted') ? null : user;
    } catch {
      return null;
    }
  }

  async createUser(input: CreateUserInput): Promise<CreateUserResult> {
    const name = input.name.trim();
    if (!isValidName(name)) {
      return { status: 'invalid_name', message: 'Nama wajib 1–100 karakter' };
    }
    if (!AuthService.isValidPinFormat(input.pin)) {
      return { status: 'invalid_pin', message: 'PIN minimal 4 digit angka' };
    }
    if (!USER_ROLES.includes(input.role)) {
      return { status: 'invalid_role', message: 'Role tidak valid' };
    }
    const isActive = input.isActive ?? true;
    const timestamp = this.now();
    const pinHash = await this.authService.hashPin(input.pin);

    let created: User | null = null;
    await this.database.write(async () => {
      created = await this.database.get<User>('users').create((raw) => {
        raw.name = name;
        raw.pinHash = pinHash;
        raw.role = input.role;
        raw.isActive = isActive;
        raw.createdAt = timestamp;
        raw.updatedAt = timestamp;
        raw._setRaw('deleted', false);
        raw._setRaw('last_modified', timestamp);
      });
    });
    if (!created) throw new Error('Gagal membuat pengguna');
    return { status: 'ok', user: created };
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<UpdateUserResult> {
    const user = await this.findUser(id);
    if (!user) {
      return { status: 'user_not_found' };
    }

    const nextName = input.name !== undefined ? input.name.trim() : user.name;
    if (!isValidName(nextName)) {
      return { status: 'invalid_name', message: 'Nama wajib 1–100 karakter' };
    }

    const nextRole = input.role ?? user.role;
    if (!USER_ROLES.includes(nextRole)) {
      return { status: 'invalid_role', message: 'Role tidak valid' };
    }

    if (input.pin !== undefined && input.pin !== null && input.pin !== '') {
      if (!AuthService.isValidPinFormat(input.pin)) {
        return { status: 'invalid_pin', message: 'PIN minimal 4 digit angka' };
      }
    }

    const nextIsActive = input.isActive ?? user.isActive;

    if (
      user.role === 'admin' &&
      user.isActive &&
      (!nextIsActive || nextRole !== 'admin')
    ) {
      const activeAdmins = await this.countActiveAdmins();
      if (activeAdmins <= 1) {
        if (!nextIsActive) {
          return {
            status: 'cannot_disable_last_admin',
            message: 'Tidak bisa menonaktifkan admin terakhir',
          };
        }
        if (nextRole !== 'admin') {
          return {
            status: 'cannot_change_last_admin_role',
            message: 'Tidak bisa mengubah role admin terakhir',
          };
        }
      }
    }

    const timestamp = this.now();
    let nextHash: string | null = null;
    if (input.pin !== undefined && input.pin !== null && input.pin !== '') {
      nextHash = await this.authService.hashPin(input.pin);
    }

    await this.database.write(async () => {
      await user.update((raw) => {
        raw.name = nextName;
        raw.role = nextRole;
        raw.isActive = nextIsActive;
        if (nextHash) {
          raw.pinHash = nextHash;
        }
        raw.updatedAt = timestamp;
        raw._setRaw('last_modified', timestamp);
      });
    });

    return { status: 'ok', user };
  }

  async countActiveAdmins(): Promise<number> {
    const rows = await this.database
      .get<User>('users')
      .query(Q.where('deleted', false), Q.where('role', 'admin'), Q.where('is_active', true))
      .fetch();
    return rows.length;
  }

  async softDeleteUser(id: string): Promise<UpdateUserResult> {
    return this.updateUser(id, { isActive: false });
  }
}
