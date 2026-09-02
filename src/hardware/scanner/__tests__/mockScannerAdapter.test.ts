import { SCANNER_ERROR_MESSAGE } from '../types';
import { MockScannerAdapter } from '../mockScannerAdapter';

describe('MockScannerAdapter', () => {
  it('normalizes input via normalizeInput', () => {
    const adapter = new MockScannerAdapter();
    expect(adapter.normalizeInput('  8992761234567  ')).toBe('8992761234567');
  });

  it('scanOnce returns queued result and records history', async () => {
    const adapter = new MockScannerAdapter();
    adapter.queueResults([{ value: '8992761234567', format: 'ean13' }]);
    const result = await adapter.scanOnce();
    expect(result).toEqual({ value: '8992761234567', format: 'ean13' });
    expect(adapter.getScanHistory()).toHaveLength(1);
  });

  it('scanOnce returns null when queue empty', async () => {
    const adapter = new MockScannerAdapter();
    const result = await adapter.scanOnce();
    expect(result).toBeNull();
  });

  it('throws when camera unavailable', async () => {
    const adapter = new MockScannerAdapter();
    adapter.setCameraAvailable(false);
    await expect(adapter.scanOnce()).rejects.toThrow(SCANNER_ERROR_MESSAGE);
  });

  it('permission denied blocks scan', async () => {
    const adapter = new MockScannerAdapter();
    adapter.setPermissionGranted(false);
    await expect(adapter.scanOnce()).rejects.toThrow(SCANNER_ERROR_MESSAGE);
    expect(await adapter.requestCameraPermission()).toBe(false);
  });

  it('requestCameraPermission respects denyNext flag', async () => {
    const adapter = new MockScannerAdapter();
    adapter.setDenyNextPermission(true);
    expect(await adapter.requestCameraPermission()).toBe(false);
    expect(await adapter.requestCameraPermission()).toBe(true);
  });

  it('fail next scan can be simulated', async () => {
    const adapter = new MockScannerAdapter();
    adapter.queueResults([{ value: '12345670', format: 'ean8' }]);
    adapter.setFailNextScan(true);
    await expect(adapter.scanOnce()).rejects.toThrow(SCANNER_ERROR_MESSAGE);
    const result = await adapter.scanOnce();
    expect(result).toEqual({ value: '12345670', format: 'ean8' });
  });

  it('startContinuousScan drains queue and can be stopped', async () => {
    const adapter = new MockScannerAdapter();
    adapter.queueResults([
      { value: '111', format: 'qr' },
      { value: '222', format: 'qr' },
    ]);
    const received: string[] = [];
    const stop = adapter.startContinuousScan((r) => received.push(r.value));
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 400);
    });
    stop();
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(adapter.getScanHistory().length).toBeGreaterThanOrEqual(1);
    await adapter.stopScan();
  });

  it('isCameraAvailable reflects set value', async () => {
    const adapter = new MockScannerAdapter();
    expect(await adapter.isCameraAvailable()).toBe(true);
    adapter.setCameraAvailable(false);
    expect(await adapter.isCameraAvailable()).toBe(false);
  });
});
