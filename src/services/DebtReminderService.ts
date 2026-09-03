import { Database, Q } from '@nozbe/watermelondb';

import Setting from '../database/models/setting';
import { DebtService } from './DebtService';

export const REMINDER_SETTING_KEY = 'debt_reminder_enabled';

export type DebtReminderOptions = {
  now?: () => number;
  debtService?: DebtService;
};

export type DebtReminderPayload = {
  count: number;
  outstanding: number;
  debtIds: string[];
  title: string;
  body: string;
};

export class DebtReminderService {
  private readonly database: Database;

  private readonly debtService: DebtService;

  private readonly now: () => number;

  constructor(database: Database, options: DebtReminderOptions = {}) {
    this.database = database;
    this.debtService = options.debtService ?? new DebtService(database, { now: options.now });
    this.now = options.now ?? Date.now;
  }

  async isEnabled(): Promise<boolean> {
    try {
      const rows = await this.database
        .get<Setting>('settings')
        .query(Q.where('key', REMINDER_SETTING_KEY))
        .fetch();
      const row = rows[0];
      if (!row) {
        return true;
      }
      const raw = row.value;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed === 'boolean') return parsed;
        if (typeof parsed === 'string') return parsed === 'true';
        return true;
      } catch {
        return raw === 'true';
      }
    } catch {
      return true;
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const value = JSON.stringify(enabled);
    await this.database.write(async () => {
      const rows = await this.database
        .get<Setting>('settings')
        .query(Q.where('key', REMINDER_SETTING_KEY))
        .fetch();
      const existing = rows[0];
      if (existing) {
        await existing.update((raw) => {
          raw.value = value;
        });
      } else {
        await this.database.get<Setting>('settings').create((raw) => {
          raw.key = REMINDER_SETTING_KEY;
          raw.value = value;
        });
      }
    });
  }

  async getDueTodaySummary(nowMs?: number): Promise<{ count: number; outstanding: number; debtIds: string[] }> {
    const now = nowMs ?? this.now();
    const debts = await this.debtService.getDueTodayDebts(now);
    const outstanding = debts.reduce((sum, debt) => sum + (debt.totalAmount - debt.paidAmount), 0);
    return { count: debts.length, outstanding, debtIds: debts.map((debt) => debt.id) };
  }

  async getOverdueSummary(nowMs?: number): Promise<{ count: number; outstanding: number; debtIds: string[] }> {
    const now = nowMs ?? this.now();
    const debts = await this.debtService.getOverdueDebts(now);
    const outstanding = debts.reduce((sum, debt) => sum + (debt.totalAmount - debt.paidAmount), 0);
    return { count: debts.length, outstanding, debtIds: debts.map((debt) => debt.id) };
  }

  async buildReminderPayload(nowMs?: number): Promise<DebtReminderPayload | null> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      return null;
    }
    const summary = await this.getDueTodaySummary(nowMs);
    if (summary.count === 0) {
      return null;
    }
    const title = 'Pengingat piutang';
    const body =
      summary.count === 1
        ? 'Ada 1 bon jatuh tempo hari ini'
        : `Ada ${summary.count} bon jatuh tempo hari ini`;
    return {
      count: summary.count,
      outstanding: summary.outstanding,
      debtIds: summary.debtIds,
      title,
      body,
    };
  }

  async shouldNotify(nowMs?: number): Promise<boolean> {
    const payload = await this.buildReminderPayload(nowMs);
    return payload !== null;
  }
}
