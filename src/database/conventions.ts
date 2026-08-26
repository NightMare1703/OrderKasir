type ColumnType = 'string' | 'number' | 'boolean';

export type ColumnDef = {
  name: string;
  type: ColumnType;
  isIndexed?: boolean;
};

export const SYNC_COLUMN_DEFS: ColumnDef[] = [
  { name: 'last_modified', type: 'number', isIndexed: true },
  { name: 'deleted', type: 'boolean', isIndexed: true },
];

// AGENTS.md §4.5: semua tabel domain wajib punya last_modified + deleted untuk sync.
export const withSyncColumns = (columns: ColumnDef[]): ColumnDef[] => [
  ...columns,
  ...SYNC_COLUMN_DEFS,
];
