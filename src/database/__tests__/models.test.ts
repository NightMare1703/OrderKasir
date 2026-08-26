import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';

import Setting from '../models/setting';
import User from '../models/user';
import { appDatabaseSchema } from '../schema';

// Test in-memory: matikan autosave (setInterval-nya menjaga event loop Jest tetap hidup).
logger.silence();

const makeAdapter = () =>
  new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    extraLokiOptions: { autosave: false },
  });

const makeDb = () =>
  new Database({ adapter: makeAdapter(), modelClasses: [Setting, User] });

describe('schema v1 part 1: users & settings (T0.5)', () => {
  it('membuat, membaca, mengubah, dan soft-delete user', async () => {
    const db = makeDb();
    const users = db.get<User>('users');

    const created = await db.write(async () =>
      users.create((user) => {
        user.name = 'Budi Santoso';
        user.pinHash = '$scrypt$fake-hash';
        user.role = 'admin';
        user.isActive = true;
        user.createdAt = 1756200000000;
        user.updatedAt = 1756200000000;
      }),
    );

    const found = await users.find(created.id);
    expect(found.name).toBe('Budi Santoso');
    expect(found.role).toBe('admin');
    expect(found.isActive).toBe(true);
    expect(found.pinHash).toBe('$scrypt$fake-hash');
    expect(typeof found._getRaw('last_modified')).toBe('number');
    expect(found._getRaw('deleted')).toBe(false);

    await db.write(async () => {
      await found.update((user) => {
        user.role = 'kasir';
        user.updatedAt = 1756200060000;
      });
      await found.update((user) => {
        user._setRaw('deleted', true);
      });
    });

    expect(found.role).toBe('kasir');
    expect(found._getRaw('deleted')).toBe(true);

    await db.write(() => db.unsafeResetDatabase());
  });

  it('menyimpan dan mengambil setting key-value', async () => {
    const db = makeDb();
    const settings = db.get<Setting>('settings');

    const created = await db.write(async () =>
      settings.create((setting) => {
        setting.key = 'store_name';
        setting.value = JSON.stringify('Warung Bu Sari');
      }),
    );

    const rows = await settings.query().fetch();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
    expect(rows[0].key).toBe('store_name');
    expect(JSON.parse(rows[0].value)).toBe('Warung Bu Sari');

    await db.write(async () => {
      await rows[0].update((setting) => {
        setting.value = JSON.stringify('Warung Bu Sari Updated');
      });
    });

    const updated = await settings.find(created.id);
    expect(JSON.parse(updated.value)).toBe('Warung Bu Sari Updated');

    await db.write(() => db.unsafeResetDatabase());
  });
});
