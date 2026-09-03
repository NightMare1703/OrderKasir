import { Database, Q } from '@nozbe/watermelondb';

import Setting from '../database/models/setting';
import { changeAppLanguage, DEFAULT_LANGUAGE } from '../i18n';

export const STORE_NAME_KEY = 'store_name';
export const STORE_ADDRESS_KEY = 'store_address';
export const RECEIPT_FOOTER_KEY = 'receipt_footer';
export const LANGUAGE_KEY = 'language';

export const SUPPORTED_LANGUAGES = ['id', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type StoreProfile = {
  storeName: string | null;
  storeAddress: string | null;
  receiptFooter: string | null;
};

export type UpdateStoreProfileInput = {
  storeName?: string | null;
  storeAddress?: string | null;
  receiptFooter?: string | null;
};

export type UpdateStoreProfileResult =
  | { status: 'ok'; profile: StoreProfile }
  | { status: 'invalid_store_name'; message: string }
  | { status: 'invalid_store_address'; message: string }
  | { status: 'invalid_receipt_footer'; message: string };

export class SettingsService {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async getStoreProfile(): Promise<StoreProfile> {
    const rows = await this.database.get<Setting>('settings').query().fetch();
    const find = (key: string): string | null => {
      const row = rows.find((r) => r.key === key);
      if (!row) return null;
      const raw = row.value;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed === 'string') {
          const trimmed = parsed.trim();
          return trimmed === '' ? null : parsed.trim();
        }
        return raw.trim() === '' ? null : raw.trim();
      } catch {
        const trimmed = raw.trim();
        return trimmed === '' ? null : trimmed;
      }
    };
    return {
      storeName: find(STORE_NAME_KEY),
      storeAddress: find(STORE_ADDRESS_KEY),
      receiptFooter: find(RECEIPT_FOOTER_KEY),
    };
  }

  async updateStoreProfile(input: UpdateStoreProfileInput): Promise<UpdateStoreProfileResult> {
    const normalize = (value: string | null | undefined): string | null => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    };

    const storeName = input.storeName !== undefined ? normalize(input.storeName) : undefined;
    const storeAddress =
      input.storeAddress !== undefined ? normalize(input.storeAddress) : undefined;
    const receiptFooter =
      input.receiptFooter !== undefined ? normalize(input.receiptFooter) : undefined;

    if (storeName !== undefined && storeName !== null) {
      if (storeName.length > 100) {
        return { status: 'invalid_store_name', message: 'Nama toko maksimal 100 karakter' };
      }
      if (storeName.length < 1) {
        return { status: 'invalid_store_name', message: 'Nama toko wajib diisi' };
      }
    }
    if (storeAddress !== undefined && storeAddress !== null && storeAddress.length > 200) {
      return {
        status: 'invalid_store_address',
        message: 'Alamat toko maksimal 200 karakter',
      };
    }
    if (receiptFooter !== undefined && receiptFooter !== null && receiptFooter.length > 200) {
      return {
        status: 'invalid_receipt_footer',
        message: 'Footer struk maksimal 200 karakter',
      };
    }

    await this.database.write(async () => {
      if (storeName !== undefined) {
        await this.writeSettingValue(STORE_NAME_KEY, storeName);
      }
      if (storeAddress !== undefined) {
        await this.writeSettingValue(STORE_ADDRESS_KEY, storeAddress);
      }
      if (receiptFooter !== undefined) {
        await this.writeSettingValue(RECEIPT_FOOTER_KEY, receiptFooter);
      }
    });

    const profile = await this.getStoreProfile();
    return { status: 'ok', profile };
  }

  async getLanguage(): Promise<SupportedLanguage> {
    const rows = await this.database
      .get<Setting>('settings')
      .query(Q.where('key', LANGUAGE_KEY))
      .fetch();
    if (rows.length === 0) return DEFAULT_LANGUAGE as SupportedLanguage;
    const raw = rows[0].value;
    let parsed: string = raw;
    try {
      const json = JSON.parse(raw) as unknown;
      if (typeof json === 'string') parsed = json;
    } catch {
      parsed = raw;
    }
    const trimmed = parsed.trim();
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(trimmed)) {
      return trimmed as SupportedLanguage;
    }
    return DEFAULT_LANGUAGE as SupportedLanguage;
  }

  async setLanguage(language: SupportedLanguage): Promise<{ status: 'ok' } | { status: 'invalid_language' }> {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) {
      return { status: 'invalid_language' };
    }
    await this.database.write(async () => {
      await this.writeSettingValue(LANGUAGE_KEY, language);
    });
    await changeAppLanguage(language);
    return { status: 'ok' };
  }

  async restoreLanguageFromSettings(): Promise<SupportedLanguage> {
    const lang = await this.getLanguage();
    await changeAppLanguage(lang);
    return lang;
  }

  private async writeSettingValue(key: string, value: string | null): Promise<void> {
    const rows = await this.database
      .get<Setting>('settings')
      .query(Q.where('key', key))
      .fetch();
    const existing = rows[0];
    if (value === null) {
      if (existing) {
        await existing.destroyPermanently();
      }
      return;
    }
    const stored = JSON.stringify(value);
    if (existing) {
      await existing.update((raw) => {
        raw.value = stored;
      });
    } else {
      await this.database.get<Setting>('settings').create((raw) => {
        raw.key = key;
        raw.value = stored;
      });
    }
  }
}
