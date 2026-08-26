import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { appSchema, tableSchema } from '@nozbe/watermelondb';
import Model from '@nozbe/watermelondb/Model';
import logger from '@nozbe/watermelondb/utils/common/logger';

import { withSyncColumns } from '../conventions';

// Test in-memory: matikan autosave (setInterval-nya menjaga event loop Jest tetap hidup).
logger.silence();

class DummyProduct extends Model {
  static table = 'dummy_products';

  get name(): string {
    return this._getRaw('name') as string;
  }

  set name(value: string) {
    this._setRaw('name', value);
  }
}

const testSchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'dummy_products',
      columns: withSyncColumns([
        { name: 'name', type: 'string' },
      ]),
    }),
  ],
});

const makeAdapter = () =>
  new LokiJSAdapter({
    schema: testSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    extraLokiOptions: { autosave: false },
  });

describe('database setup (T0.4)', () => {
  it('membuka database dan menjalankan query dummy end-to-end', async () => {
    const db = new Database({ adapter: makeAdapter(), modelClasses: [DummyProduct] });

    await db.write(async () => {
      await db.get<DummyProduct>('dummy_products').create((dummy) => {
        dummy.name = 'Indomie Goreng';
      });
    });

    const rows = await db.get<DummyProduct>('dummy_products').query().fetch();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Indomie Goreng');
    expect(typeof rows[0]._getRaw('last_modified')).toBe('number');
    expect(rows[0]._getRaw('deleted')).toBe(false);

    await db.write(() => db.unsafeResetDatabase());
  });
});
