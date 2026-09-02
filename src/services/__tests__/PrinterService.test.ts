import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import logger from '@nozbe/watermelondb/utils/common/logger';

import Setting from '../../database/models/setting';
import { appDatabaseSchema } from '../../database/schema';
import { MockPrinterAdapter } from '../../hardware/printer/mockPrinterAdapter';
import { buildTestPrintBytes, bytesToAscii, containsText } from '../../hardware/printer/escpos';
import { PRINTER_ERROR_MESSAGE } from '../../hardware/printer/types';
import { PrinterService } from '../PrinterService';

logger.silence();

const makeDb = () => {
  const adapter = new LokiJSAdapter({
    schema: appDatabaseSchema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    extraLokiOptions: { autosave: false },
  });
  return new Database({
    adapter,
    modelClasses: [Setting],
  });
};

describe('PrinterService (T2.4)', () => {
  it('scan mengembalikan daftar mock devices', async () => {
    const db = makeDb();
    const service = new PrinterService(db, new MockPrinterAdapter());
    const result = await service.scan();
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.devices.length).toBeGreaterThanOrEqual(2);
    expect(result.devices.some((d) => d.address === '00:11:22:33:44:58')).toBe(true);
  });

  it('scan yang gagal mengembalikan error dengan pesan actionable', async () => {
    const db = makeDb();
    const failingAdapter = {
      scan: async () => {
        throw Object.assign(new Error(PRINTER_ERROR_MESSAGE), { code: 'scan_failed' });
      },
      connect: async () => {},
      disconnect: async () => {},
      isConnected: async () => false,
      getConnectedDevice: () => null,
      print: async () => {},
    };
    const service = new PrinterService(db, failingAdapter as never);
    const result = await service.scan();
    expect(result).toMatchObject({ status: 'error', message: PRINTER_ERROR_MESSAGE });
  });

  it('connect menyimpan printer default di settings', async () => {
    const db = makeDb();
    const service = new PrinterService(db, new MockPrinterAdapter());
    const result = await service.connect('00:11:22:33:44:58');
    expect(result.status).toBe('connected');
    const def = await service.getDefaultPrinter();
    expect(def).not.toBeNull();
    expect(def?.address).toBe('00:11:22:33:44:58');
    expect(def?.name).toBe('Printer 58mm Mock');
    expect(await service.isConnected()).toBe(true);
    expect(service.getConnectedDevice()?.address).toBe('00:11:22:33:44:58');
  });

  it('connect menyimpan address custom yang tidak ada di mock list', async () => {
    const db = makeDb();
    const service = new PrinterService(db, new MockPrinterAdapter());
    const custom = 'AA:BB:CC:DD:EE:FF';
    const result = await service.connect(custom, 'Printer Custom');
    expect(result.status).toBe('connected');
    const def = await service.getDefaultPrinter();
    expect(def?.address).toBe(custom);
    expect(def?.name).toBe(`Printer ${custom}`);
  });

  it('connect yang gagal mengembalikan error actionable dan tidak overwrite default', async () => {
    const db = makeDb();
    const adapter = new MockPrinterAdapter();
    const service = new PrinterService(db, adapter);
    await service.connect('00:11:22:33:44:58');
    adapter.setFailNextConnect(true);
    const result = await service.connect('00:11:22:33:44:80');
    expect(result).toMatchObject({ status: 'error', code: 'connection_failed' });
    expect(result).toMatchObject({ message: PRINTER_ERROR_MESSAGE });
    const def = await service.getDefaultPrinter();
    expect(def?.address).toBe('00:11:22:33:44:58');
  });

  it('getDefaultPrinter null saat belum pernah pairing', async () => {
    const db = makeDb();
    const service = new PrinterService(db, new MockPrinterAdapter());
    expect(await service.getDefaultPrinter()).toBeNull();
  });

  it('paper width default 58mm dan dapat di-set ke 80mm lalu persist', async () => {
    const db = makeDb();
    const service = new PrinterService(db, new MockPrinterAdapter());
    expect(await service.getPaperWidth()).toBe('58mm');
    await service.setPaperWidth('80mm');
    expect(await service.getPaperWidth()).toBe('80mm');
    const service2 = new PrinterService(db, new MockPrinterAdapter());
    expect(await service2.getPaperWidth()).toBe('80mm');
    await service2.setPaperWidth('58mm');
    expect(await service2.getPaperWidth()).toBe('58mm');
  });

  it('copy count clamped 1..5', async () => {
    const db = makeDb();
    const service = new PrinterService(db, new MockPrinterAdapter());
    expect(await service.getCopyCount()).toBe(1);
    await service.setCopyCount(3);
    expect(await service.getCopyCount()).toBe(3);
    await service.setCopyCount(99);
    expect(await service.getCopyCount()).toBe(5);
    await service.setCopyCount(0);
    expect(await service.getCopyCount()).toBe(1);
  });

  it('testPrint sukses setelah connect default', async () => {
    const db = makeDb();
    const adapter = new MockPrinterAdapter();
    const service = new PrinterService(db, adapter);
    await service.connect('00:11:22:33:44:58');
    await adapter.disconnect();
    expect(await service.isConnected()).toBe(false);
    const result = await service.testPrint();
    expect(result).toEqual({ status: 'ok' });
    expect(adapter.getLastPrinted()).not.toBeNull();
    expect(containsText(adapter.getLastPrinted() as Uint8Array, 'Printer terhubung')).toBe(true);
  });

  it('testPrint auto-connect ke default bila belum terhubung', async () => {
    const db = makeDb();
    const adapter = new MockPrinterAdapter();
    const service = new PrinterService(db, adapter);
    await service.connect('00:11:22:33:44:80');
    await adapter.disconnect();
    const result = await service.testPrint();
    expect(result.status).toBe('ok');
    expect(await adapter.isConnected()).toBe(true);
  });

  it('testPrint gagal bila tidak ada default dan tidak terhubung — error actionable', async () => {
    const db = makeDb();
    const service = new PrinterService(db, new MockPrinterAdapter());
    const result = await service.testPrint();
    expect(result).toEqual({
      status: 'error',
      code: 'not_connected',
      message: PRINTER_ERROR_MESSAGE,
    });
  });

  it('testPrint gagal bila write_failed — error actionable dengan retry', async () => {
    const db = makeDb();
    const adapter = new MockPrinterAdapter();
    const service = new PrinterService(db, adapter);
    await service.connect('00:11:22:33:44:58');
    adapter.setFailNextPrint(true);
    const first = await service.testPrint();
    expect(first).toMatchObject({ status: 'error', code: 'write_failed', message: PRINTER_ERROR_MESSAGE });
    const second = await service.testPrint();
    expect(second).toEqual({ status: 'ok' });
  });

  it('testPrint memakai lebar kertas yang disimpan', async () => {
    const db = makeDb();
    const adapter = new MockPrinterAdapter();
    const service = new PrinterService(db, adapter);
    await service.connect('00:11:22:33:44:58');
    await service.setPaperWidth('80mm');
    adapter.clearBuffers();
    await service.testPrint();
    const last = adapter.getLastPrinted() as Uint8Array;
    const ascii = bytesToAscii(last);
    expect(ascii).toContain('80mm');
    expect(ascii).toContain('48');
    await service.setPaperWidth('58mm');
    adapter.clearBuffers();
    await service.testPrint();
    const last58 = adapter.getLastPrinted() as Uint8Array;
    expect(bytesToAscii(last58)).toContain('58mm');
    expect(bytesToAscii(last58)).toContain('32');
  });

  it('testPrint memakai nama toko dari settings bila ada', async () => {
    const db = makeDb();
    const adapter = new MockPrinterAdapter();
    await db.write(() =>
      db.get<Setting>('settings').create((r) => {
        r.key = 'store_name';
        r.value = JSON.stringify('Warung Bu Sari');
      }),
    );
    const getStoreName = async () => {
      const rows = await db.get<Setting>('settings').query().fetch();
      const found = rows.find((r) => r.key === 'store_name');
      if (!found) return null;
      try {
        return JSON.parse(found.value) as string;
      } catch {
        return found.value;
      }
    };
    const service = new PrinterService(db, adapter, { getStoreName });
    await service.connect('00:11:22:33:44:58');
    adapter.clearBuffers();
    const result = await service.testPrint();
    expect(result.status).toBe('ok');
    expect(containsText(adapter.getLastPrinted() as Uint8Array, 'Warung Bu Sari')).toBe(true);
  });

  it('fallback share text selalu tersedia meski printer tidak ada', async () => {
    const db = makeDb();
    const service = new PrinterService(db, new MockPrinterAdapter());
    const text = await service.buildTestShareText();
    expect(text).toContain('Printer terhubung');
    expect(text).toContain('Test Print');
    const bytes = buildTestPrintBytes('58mm');
    const direct = await service.buildShareTextFromBytes(bytes);
    expect(direct).toContain('Test Print');
  });

  it('disconnect membuat isConnected false', async () => {
    const db = makeDb();
    const adapter = new MockPrinterAdapter();
    const service = new PrinterService(db, adapter);
    await service.connect('00:11:22:33:44:58');
    expect(await service.isConnected()).toBe(true);
    await service.disconnect();
    expect(await service.isConnected()).toBe(false);
  });
});
