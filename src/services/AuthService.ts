import { Database } from '@nozbe/watermelondb';
import { scrypt } from 'scrypt-js';

import User, { UserRole } from '../database/models/user';

export type { UserRole };

export const PIN_MIN_LENGTH = 4;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 30_000;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const HASH_KEY_LENGTH = 32;

export type PinHasher = {
  hash(pin: string): Promise<string>;
  verify(pin: string, hash: string): Promise<boolean>;
};

export type LoginResult =
  | { status: 'ok'; user: User }
  | { status: 'invalid_pin'; remainingAttempts: number }
  | { status: 'locked'; retryAfterMs: number }
  | { status: 'pin_too_short' }
  | { status: 'user_not_found' }
  | { status: 'user_inactive' };

type LockoutState = {
  failedCount: number;
  lockedUntil: number | null;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

// PIN divalidasi digits-only sebelum dipanggil, jadi encode byte-per-char cukup
// dan aman untuk Hermes tanpa TextEncoder.
const toUtf8Bytes = (value: string): Uint8Array => {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i);
  }
  return bytes;
};

type WebCryptoLike = {
  getRandomValues(bytes: Uint8Array): Uint8Array;
};

const getRandomBytes = (length: number): Uint8Array => {
  const webCrypto = (globalThis as unknown as { crypto?: WebCryptoLike }).crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    webCrypto.getRandomValues(bytes);
    return bytes;
  }
  // Hermes tanpa polyfill WebCrypto: fallback RNG lemah, hanya sementara
  // sampai react-native-get-random-values terpasang (PRD §10 keamanan).
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
};

// Format: $scrypt$<N>$<r>$<p>$<saltHex>$<hashHex> — param ikut tersimpan agar
// bisa diperkuat nanti tanpa membatalkan hash lama.
class ScryptPinHasher implements PinHasher {
  async hash(pin: string): Promise<string> {
    const salt = getRandomBytes(16);
    const derivedKey = await scrypt(
      toUtf8Bytes(pin),
      salt,
      SCRYPT_N,
      SCRYPT_R,
      SCRYPT_P,
      HASH_KEY_LENGTH,
    );
    return `$scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toHex(salt)}$${toHex(
      new Uint8Array(derivedKey),
    )}`;
  }

  async verify(pin: string, hash: string): Promise<boolean> {
    const parts = hash.split('$');
    if (parts.length !== 7 || parts[1] !== 'scrypt') {
      return false;
    }
    const [, , n, r, p, saltHex, expectedHex] = parts;
    const derivedKey = await scrypt(
      toUtf8Bytes(pin),
      fromHex(saltHex),
      Number(n),
      Number(r),
      Number(p),
      fromHex(expectedHex).length,
    );
    return toHex(new Uint8Array(derivedKey)) === expectedHex;
  }
}

export type AuthServiceOptions = {
  hasher?: PinHasher;
  now?: () => number;
};

export class AuthService {
  private readonly database: Database;

  private readonly hasher: PinHasher;

  private readonly now: () => number;

  private lockouts = new Map<string, LockoutState>();

  constructor(database: Database, options: AuthServiceOptions = {}) {
    this.database = database;
    this.hasher = options.hasher ?? new ScryptPinHasher();
    this.now = options.now ?? Date.now;
  }

  static isValidPinFormat(pin: string): boolean {
    return pin.length >= PIN_MIN_LENGTH && /^\d+$/.test(pin);
  }

  static isAdmin(user: User): boolean {
    return user.role === 'admin';
  }

  getLockoutRemainingMs(userId: string): number {
    const state = this.lockouts.get(userId);
    if (!state || state.lockedUntil === null) {
      return 0;
    }
    return Math.max(0, state.lockedUntil - this.now());
  }

  async hashPin(pin: string): Promise<string> {
    return this.hasher.hash(pin);
  }

  async verifyPin(pin: string, hash: string): Promise<boolean> {
    return this.hasher.verify(pin, hash);
  }

  async login(userId: string, pin: string): Promise<LoginResult> {
    if (!AuthService.isValidPinFormat(pin)) {
      return { status: 'pin_too_short' };
    }

    let user: User | undefined;
    try {
      user = await this.database.get<User>('users').find(userId);
    } catch {
      user = undefined;
    }
    if (!user || user._getRaw('deleted')) {
      return { status: 'user_not_found' };
    }
    if (!user.isActive) {
      return { status: 'user_inactive' };
    }

    const remainingLockoutMs = this.getLockoutRemainingMs(user.id);
    if (remainingLockoutMs > 0) {
      return { status: 'locked', retryAfterMs: remainingLockoutMs };
    }

    const isCorrectPin = await this.hasher.verify(pin, user.pinHash);

    if (isCorrectPin) {
      this.lockouts.delete(user.id);
      return { status: 'ok', user };
    }

    return this.registerFailedAttempt(user.id);
  }

  private registerFailedAttempt(userId: string): LoginResult {
    const state = this.lockouts.get(userId) ?? { failedCount: 0, lockedUntil: null };
    const failedCount = state.failedCount + 1;

    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      this.lockouts.set(userId, {
        failedCount,
        lockedUntil: this.now() + LOCKOUT_DURATION_MS,
      });
      return { status: 'locked', retryAfterMs: LOCKOUT_DURATION_MS };
    }

    this.lockouts.set(userId, { failedCount, lockedUntil: null });
    return {
      status: 'invalid_pin',
      remainingAttempts: MAX_FAILED_ATTEMPTS - failedCount,
    };
  }
}
