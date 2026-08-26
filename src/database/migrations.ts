import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

import { DATABASE_SCHEMA_VERSION } from './schema';

// Append-only: tambah entri baru per versi schema, jangan pernah mengubah yang sudah rilis.
export const migrations = schemaMigrations({
  migrations: [],
});

export const migrationEvents = {
  currentVersion: DATABASE_SCHEMA_VERSION,
};
