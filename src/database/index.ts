import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { migrations } from './migrations';
import Category from './models/category';
import Product from './models/product';
import Setting from './models/setting';
import User from './models/user';
import { appDatabaseSchema } from './schema';

export {
  SYNC_COLUMN_DEFS,
  withSyncColumns,
} from './conventions';
export type { ColumnDef } from './conventions';
export type { UserRole } from './models/user';
export type { ProductUnit } from './models/product';

const adapter = new SQLiteAdapter({
  schema: appDatabaseSchema,
  migrations,
  // JSI adapter: performa lebih baik di device low-end (AGENTS.md §1).
  jsi: true,
  dbName: 'orderkasir',
});

export const database = new Database({
  adapter,
  modelClasses: [Category, Product, Setting, User],
});
