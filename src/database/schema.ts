import { appSchema } from '@nozbe/watermelondb';

export const DATABASE_SCHEMA_VERSION = 1;

// v1 belum punya tabel domain; users & settings menyusul di T0.5.
// Kolom last_modified/deleted di semua tabel domain dijamin via withSyncColumns().
export const appDatabaseSchema = appSchema({
  version: DATABASE_SCHEMA_VERSION,
  tables: [],
});
