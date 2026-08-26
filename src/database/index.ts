import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { migrations } from './migrations';
import { appDatabaseSchema } from './schema';

export {
  SYNC_COLUMN_DEFS,
  withSyncColumns,
} from './conventions';
export type { ColumnDef } from './conventions';

const adapter = new SQLiteAdapter({
  schema: appDatabaseSchema,
  migrations,
  // JSI adapter: performa lebih baik di device low-end (AGENTS.md §1).
  jsi: true,
  dbName: 'orderkasir',
});

export const database = new Database({
  adapter,
  modelClasses: [],
});
