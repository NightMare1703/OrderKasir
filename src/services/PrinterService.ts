import { Database, Q } from '@nozbe/watermelondb';

import Setting from '../database/models/setting';
import { MockPrinterAdapter } from '../hardware/printer/mockPrinterAdapter';
import type { PrinterAdapter, PrinterError } from '../hardware/printer/adapter';
import { buildTestPrintBytes, bytesToAscii } from '../hardware/printer/escpos';
import {
  PRINTER_ERROR_MESSAGE,
  PRINTER_SETTINGS_KEYS,
  type PaperWidth,
  type PrinterDevice,
} from '../hardware/printer/types';

export type PrinterScanResult =
  | { status: 'ok'; devices: PrinterDevice[] }
  | { status: 'error'; code: string; message: string };

export type PrinterConnectResult =
  | { status: 'connected'; device: PrinterDevice }
  | { status: 'error'; code: string; message: string };

export type PrinterPrintResult =
  | { status: 'ok' }
  | { status: 'error'; code: string; message: string };

const DEFAULT_PAPER_WIDTH: PaperWidth = '58mm';

const isPaperWidth = (value: string): value is PaperWidth =>
  value === '58mm' || value === '80mm';

export class PrinterService {
  private readonly database: Database;

  private readonly adapter: PrinterAdapter;

  private readonly getStoreName: () => Promise<string | null>;

  constructor(
    database: Database,
    adapter: PrinterAdapter = new MockPrinterAdapter(),
    options: { getStoreName?: () => Promise<string | null> } = {},
  ) {
    this.database = database;
    this.adapter = adapter;
    this.getStoreName = options.getStoreName ?? (async () => null);
  }

  async scan(): Promise<PrinterScanResult> {
    try {
      const devices = await this.adapter.scan();
      return { status: 'ok', devices };
    } catch (error) {
      const printerError = error as PrinterError;
      return {
        status: 'error',
        code: printerError?.code ?? 'scan_failed',
        message: printerError?.message ?? PRINTER_ERROR_MESSAGE,
      };
    }
  }

  async connect(address: string, name?: string): Promise<PrinterConnectResult> {
    try {
      await this.adapter.connect(address);
      const device = this.adapter.getConnectedDevice();
      const resolved: PrinterDevice = device ?? {
        id: address,
        address,
        name: name ?? address,
      };
      await this.saveDefaultPrinter(resolved);
      return { status: 'connected', device: resolved };
    } catch (error) {
      const printerError = error as PrinterError;
      return {
        status: 'error',
        code: printerError?.code ?? 'connection_failed',
        message: printerError?.message ?? PRINTER_ERROR_MESSAGE,
      };
    }
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  async isConnected(): Promise<boolean> {
    return this.adapter.isConnected();
  }

  getConnectedDevice(): PrinterDevice | null {
    return this.adapter.getConnectedDevice();
  }

  async getDefaultPrinter(): Promise<PrinterDevice | null> {
    const address = await this.readSetting(PRINTER_SETTINGS_KEYS.defaultAddress);
    if (!address) return null;
    const name = await this.readSetting(PRINTER_SETTINGS_KEYS.defaultName);
    return {
      id: address,
      address,
      name: name ?? address,
    };
  }

  async clearDefaultPrinter(): Promise<void> {
    await this.deleteSetting(PRINTER_SETTINGS_KEYS.defaultAddress);
    await this.deleteSetting(PRINTER_SETTINGS_KEYS.defaultName);
  }

  async getPaperWidth(): Promise<PaperWidth> {
    const raw = await this.readSetting(PRINTER_SETTINGS_KEYS.paperWidth);
    if (raw && isPaperWidth(raw)) return raw;
    return DEFAULT_PAPER_WIDTH;
  }

  async setPaperWidth(width: PaperWidth): Promise<void> {
    if (!isPaperWidth(width)) throw new Error(`paper width tidak valid: ${width}`);
    await this.writeSetting(PRINTER_SETTINGS_KEYS.paperWidth, width);
  }

  async getCopyCount(): Promise<number> {
    const raw = await this.readSetting(PRINTER_SETTINGS_KEYS.copyCount);
    if (!raw) return 1;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.min(parsed, 5);
  }

  async setCopyCount(count: number): Promise<void> {
    const normalized = Math.max(1, Math.min(5, Math.floor(count)));
    await this.writeSetting(PRINTER_SETTINGS_KEYS.copyCount, String(normalized));
  }

  async testPrint(): Promise<PrinterPrintResult> {
    const paperWidth = await this.getPaperWidth();
    let storeName: string | undefined;
    try {
      const stored = await this.getStoreName();
      if (stored) storeName = stored;
    } catch {
      // store name opsional
    }
    const bytes = buildTestPrintBytes(paperWidth, storeName ?? 'OrderKasir');

    const connected = await this.adapter.isConnected();
    if (!connected) {
      const defaultPrinter = await this.getDefaultPrinter();
      if (defaultPrinter) {
        try {
          await this.adapter.connect(defaultPrinter.address);
        } catch (error) {
          const printerError = error as PrinterError;
          return {
            status: 'error',
            code: printerError?.code ?? 'connection_failed',
            message: printerError?.message ?? PRINTER_ERROR_MESSAGE,
          };
        }
      }
    }

    const stillConnected = await this.adapter.isConnected();
    if (!stillConnected) {
      return {
        status: 'error',
        code: 'not_connected',
        message: PRINTER_ERROR_MESSAGE,
      };
    }

    try {
      await this.adapter.print(bytes);
      return { status: 'ok' };
    } catch (error) {
      const printerError = error as PrinterError;
      return {
        status: 'error',
        code: printerError?.code ?? 'write_failed',
        message: printerError?.message ?? PRINTER_ERROR_MESSAGE,
      };
    }
  }

  async buildTestShareText(): Promise<string> {
    const paperWidth = await this.getPaperWidth();
    let storeName: string | undefined;
    try {
      const stored = await this.getStoreName();
      if (stored) storeName = stored;
    } catch {
      // abaikan
    }
    const bytes = buildTestPrintBytes(paperWidth, storeName ?? 'OrderKasir');
    return bytesToAscii(bytes).trim();
  }

  async buildShareTextFromBytes(bytes: Uint8Array): Promise<string> {
    return bytesToAscii(bytes).trim();
  }

  private async readSetting(key: string): Promise<string | null> {
    const rows = await this.database
      .get<Setting>('settings')
      .query(Q.where('key', key))
      .fetch();
    if (rows.length === 0) return null;
    return rows[0].value;
  }

  private async writeSetting(key: string, value: string): Promise<void> {
    const existing = await this.database
      .get<Setting>('settings')
      .query(Q.where('key', key))
      .fetch();
    if (existing.length > 0) {
      await this.database.write(() =>
        existing[0].update((record) => {
          record.value = value;
        }),
      );
    } else {
      await this.database.write(() =>
        this.database.get<Setting>('settings').create((record) => {
          record.key = key;
          record.value = value;
        }),
      );
    }
  }

  private async deleteSetting(key: string): Promise<void> {
    const rows = await this.database
      .get<Setting>('settings')
      .query(Q.where('key', key))
      .fetch();
    if (rows.length === 0) return;
    await this.database.write(async () => {
      for (const row of rows) {
        await row.destroyPermanently();
      }
    });
  }

  private async saveDefaultPrinter(device: PrinterDevice): Promise<void> {
    await this.writeSetting(PRINTER_SETTINGS_KEYS.defaultAddress, device.address);
    await this.writeSetting(PRINTER_SETTINGS_KEYS.defaultName, device.name);
  }
}
