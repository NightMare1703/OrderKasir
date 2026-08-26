import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';

import User from '../../database/models/user';
import { appDatabaseSchema } from '../../database/schema';
import {
  AuthService,
  LOCKOUT_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  PIN_MIN_LENGTH,
  PinHasher,
} from '../AuthService';

logger.silence();

const makeDb = () => {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    extraLokiOptions: { autosave: false },
  });
  return new Database({ adapter, modelClasses: [User] });
};

// Hasher cepat & deterministik agar test lockout tidak membayar biaya scrypt.
const makeFakeHasher = (): PinHasher => ({
  hash: async (pin) => `plain$${pin}`,
  verify: async (pin, hash) => hash === `plain$${pin}`,
});

type TestHarness = {
  db: Database;
  service: AuthService;
  advanceMs: (ms: number) => void;
};

const makeHarness = (): TestHarness => {
  const db = makeDb();
  let currentTime = 1_000_000;
  const service = new AuthService(db, {
    hasher: makeFakeHasher(),
    now: () => currentTime,
  });
  return {
    db,
    service,
    advanceMs: (ms) => {
      currentTime += ms;
    },
  };
};

type UserOverrides = Partial<{
  name: string;
  pin: string;
  role: 'admin' | 'kasir';
  isActive: boolean;
}>;

const createUser = async (
  db: Database,
  overrides: UserOverrides = {},
): Promise<User> => {
  const { name = 'Budi Santoso', pin = '1234', role = 'kasir', isActive = true } =
    overrides;
  return db.write(() =>
    db.get<User>('users').create((user) => {
      user.name = name;
      user.pinHash = `plain$${pin}`;
      user.role = role;
      user.isActive = isActive;
      user.createdAt = 1_756_200_000_000;
      user.updatedAt = 1_756_200_000_000;
    }),
  );
};

describe('ScryptPinHasher (default hasher)', () => {
  it.each(['1234', '000000', '987654'])(
    'roundtrip verifikasi PIN %s',
    async (pin) => {
      const service = new AuthService(makeDb());
      const hash = await service.hashPin(pin);
      expect(hash).toMatch(/^\$scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
      await expect(service.verifyPin(pin, hash)).resolves.toBe(true);
    },
  );

  it('menolak PIN salah dan hash rusak', async () => {
    const service = new AuthService(makeDb());
    const hash = await service.hashPin('1234');
    await expect(service.verifyPin('4321', hash)).resolves.toBe(false);
    await expect(service.verifyPin('1234', '$scrypt$rusak')).resolves.toBe(false);
    await expect(service.verifyPin('1234', '')).resolves.toBe(false);
  });

  it('menghasilkan salt unik per hash', async () => {
    const service = new AuthService(makeDb());
    const [hashA, hashB] = await Promise.all([
      service.hashPin('1234'),
      service.hashPin('1234'),
    ]);
    expect(hashA).not.toBe(hashB);
  });

  it('PIN di bawah batas minimum ditolak formatnya', () => {
    expect(PIN_MIN_LENGTH).toBe(4);
    ['', '1', '12', '123', '12ab', '12345'].forEach((pin) => {
      expect(AuthService.isValidPinFormat(pin)).toBe(
        pin.length >= PIN_MIN_LENGTH && /^\d+$/.test(pin),
      );
    });
    expect(AuthService.isValidPinFormat('1234')).toBe(true);
  });
});

describe('AuthService login (T0.6)', () => {
  it('login sukses dengan PIN benar', async () => {
    const { db, service } = makeHarness();
    const user = await createUser(db, { pin: '5678', role: 'admin' });

    const result = await service.login(user.id, '5678');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.user.id).toBe(user.id);
      expect(result.user.role).toBe('admin');
      expect(AuthService.isAdmin(result.user)).toBe(true);
    }
  });

  it.each(['', '1', '12', '123'])('PIN "%s" (< 4 digit) ditolak', async (pin) => {
    const { db, service } = makeHarness();
    const user = await createUser(db);

    const result = await service.login(user.id, pin);

    expect(result).toEqual({ status: 'pin_too_short' });
  });

  it('user yang tidak ada dilaporkan user_not_found', async () => {
    const { service } = makeHarness();
    const result = await service.login('id-tidak-ada', '123456');
    expect(result).toEqual({ status: 'user_not_found' });
  });

  it('user nonaktif tidak bisa login walau PIN benar', async () => {
    const { db, service } = makeHarness();
    const user = await createUser(db, { pin: '1234', isActive: false });

    const result = await service.login(user.id, '1234');

    expect(result).toEqual({ status: 'user_inactive' });
  });
});

describe('AuthService lockout (US-01)', () => {
  it('5x PIN salah → lockout 30 detik dengan sisa percobaan menurun', async () => {
    const { db, service } = makeHarness();
    const user = await createUser(db, { pin: '9999' });

    for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      const result = await service.login(user.id, '1111');
      expect(result).toEqual({
        status: 'invalid_pin',
        remainingAttempts: MAX_FAILED_ATTEMPTS - attempt,
      });
    }

    const fifthResult = await service.login(user.id, '1111');
    expect(fifthResult).toEqual({
      status: 'locked',
      retryAfterMs: LOCKOUT_DURATION_MS,
    });
    expect(service.getLockoutRemainingMs(user.id)).toBe(LOCKOUT_DURATION_MS);
  });

  it('selama lockout PIN benar pun ditolak, lalu terbuka setelah 30 detik', async () => {
    const { db, service, advanceMs } = makeHarness();
    const user = await createUser(db, { pin: '7777' });

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await service.login(user.id, '2222');
    }

    advanceMs(LOCKOUT_DURATION_MS - 1);
    expect(await service.login(user.id, '7777')).toEqual({
      status: 'locked',
      retryAfterMs: 1,
    });
    expect(service.getLockoutRemainingMs(user.id)).toBe(1);

    advanceMs(1);
    const unlockedResult = await service.login(user.id, '7777');
    expect(unlockedResult.status).toBe('ok');
    if (unlockedResult.status === 'ok') {
      expect(unlockedResult.user.id).toBe(user.id);
    }
  });

  it('login sukses mereset counter lockout', async () => {
    const { db, service } = makeHarness();
    const user = await createUser(db, { pin: '3333' });

    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      await service.login(user.id, '4444');
    }

    expect(await service.login(user.id, '3333')).toMatchObject({
      status: 'ok',
    });
    expect(service.getLockoutRemainingMs(user.id)).toBe(0);

    // Setelah reset, butuh lagi MAX_FAILED_ATTEMPTS percobaan salah untuk terkunci.
    const firstRetry = await service.login(user.id, '4444');
    expect(firstRetry).toEqual({ status: 'invalid_pin', remainingAttempts: 4 });
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i += 1) {
      const result = await service.login(user.id, '4444');
      if (i < MAX_FAILED_ATTEMPTS - 1) {
        expect(result.status).toBe('invalid_pin');
      } else {
        expect(result).toEqual({
          status: 'locked',
          retryAfterMs: LOCKOUT_DURATION_MS,
        });
      }
    }
  });

  it('lockout dihitung per user, bukan global', async () => {
    const { db, service } = makeHarness();
    const userA = await createUser(db, { name: 'Siti', pin: '1111' });
    const userB = await createUser(db, { name: 'Joko', pin: '2222' });

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await service.login(userA.id, '0000');
    }
    expect(await service.login(userA.id, '1111')).toMatchObject({
      status: 'locked',
    });
    expect(await service.login(userB.id, '2222')).toMatchObject({
      status: 'ok',
    });
    expect(service.getLockoutRemainingMs(userB.id)).toBe(0);
  });
});
