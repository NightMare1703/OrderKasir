export type SyncTableChange = {
  created: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  deleted: string[];
};

export type SyncDatabaseChangeSet = {
  [table: string]: SyncTableChange;
};

export type SyncPullArgs = {
  lastPulledAt: number;
  schemaVersion: number;
  migration?: unknown;
};

export type SyncPullResult = {
  changes: SyncDatabaseChangeSet;
  timestamp: number;
};

export type SyncPushArgs = {
  changes: SyncDatabaseChangeSet;
  lastPulledAt: number;
};

export interface SyncAdapter {
  pullChanges(args: SyncPullArgs): Promise<SyncPullResult>;
  pushChanges(args: SyncPushArgs): Promise<void>;
}

export class MockSyncAdapter implements SyncAdapter {
  private timestamp = 1000;

  public pullHistory: SyncPullArgs[] = [];

  public pushHistory: SyncPushArgs[] = [];

  private remoteChanges: SyncDatabaseChangeSet = {};

  private failNextPull = false;

  private failNextPush = false;

  private pullErrorMessage = 'pull failed';

  private pushErrorMessage = 'push failed';

  setRemoteChanges(changes: SyncDatabaseChangeSet): void {
    this.remoteChanges = changes;
  }

  setTimestamp(timestamp: number): void {
    this.timestamp = timestamp;
  }

  failNextPullWith(message = 'pull failed'): void {
    this.failNextPull = true;
    this.pullErrorMessage = message;
  }

  failNextPushWith(message = 'push failed'): void {
    this.failNextPush = true;
    this.pushErrorMessage = message;
  }

  reset(): void {
    this.pullHistory = [];
    this.pushHistory = [];
    this.remoteChanges = {};
    this.failNextPull = false;
    this.failNextPush = false;
    this.timestamp = 1000;
  }

  async pullChanges(args: SyncPullArgs): Promise<SyncPullResult> {
    this.pullHistory.push(args);
    if (this.failNextPull) {
      this.failNextPull = false;
      throw new Error(this.pullErrorMessage);
    }
    return { changes: this.remoteChanges, timestamp: this.timestamp };
  }

  async pushChanges(args: SyncPushArgs): Promise<void> {
    this.pushHistory.push(args);
    if (this.failNextPush) {
      this.failNextPush = false;
      throw new Error(this.pushErrorMessage);
    }
  }
}

export class FirebaseSyncAdapter implements SyncAdapter {
  // Firebase stub — swappable adapter; real impl will call Firestore/Storage.
  // v1 single-device backup: pushChanges uploads incrementally; pullChanges only
  // used on restore (replace-only). No realtime multi-device in v1.

  async pullChanges(_args: SyncPullArgs): Promise<SyncPullResult> {
    throw new Error('FirebaseSyncAdapter belum dikonfigurasi — gunakan MockSyncAdapter di test');
  }

  async pushChanges(_args: SyncPushArgs): Promise<void> {
    throw new Error('FirebaseSyncAdapter belum dikonfigurasi — gunakan MockSyncAdapter di test');
  }
}
