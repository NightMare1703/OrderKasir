import { SCANNER_ERROR_MESSAGE, type ScannerResult } from './types';
import { normalizeBarcode } from './barcode';
import { ScannerError, type ScannerAdapter } from './adapter';

export class MockScannerAdapter implements ScannerAdapter {
  private cameraAvailable = true;

  private permissionGranted = true;

  private shouldFailNextScan = false;

  private shouldDenyNextPermission = false;

  private nextResults: ScannerResult[] = [];

  private scanHistory: ScannerResult[] = [];

  private continuousTimer: ReturnType<typeof setInterval> | null = null;

  getScanHistory(): ScannerResult[] {
    return [...this.scanHistory];
  }

  clearHistory(): void {
    this.scanHistory.length = 0;
  }

  setCameraAvailable(value: boolean): void {
    this.cameraAvailable = value;
  }

  setPermissionGranted(value: boolean): void {
    this.permissionGranted = value;
  }

  setFailNextScan(value: boolean): void {
    this.shouldFailNextScan = value;
  }

  setDenyNextPermission(value: boolean): void {
    this.shouldDenyNextPermission = value;
  }

  queueResults(results: ScannerResult[]): void {
    this.nextResults = [...results];
  }

  queueBarcodes(barcodes: string[]): void {
    this.nextResults = barcodes.map((value) => ({
      value: normalizeBarcode(value),
      format: 'unknown' as const,
    }));
  }

  async isCameraAvailable(): Promise<boolean> {
    return this.cameraAvailable;
  }

  async requestCameraPermission(): Promise<boolean> {
    if (this.shouldDenyNextPermission) {
      this.shouldDenyNextPermission = false;
      return false;
    }
    return this.permissionGranted;
  }

  async scanOnce(): Promise<ScannerResult | null> {
    if (this.shouldFailNextScan) {
      this.shouldFailNextScan = false;
      throw new ScannerError(SCANNER_ERROR_MESSAGE, 'scan_failed');
    }
    if (!this.cameraAvailable) {
      throw new ScannerError(SCANNER_ERROR_MESSAGE, 'camera_unavailable');
    }
    if (!this.permissionGranted) {
      throw new ScannerError(SCANNER_ERROR_MESSAGE, 'permission_denied');
    }
    const next = this.nextResults.shift() ?? null;
    if (next) {
      this.scanHistory.push(next);
    }
    return next;
  }

  startContinuousScan(onResult: (result: ScannerResult) => void): () => void {
    if (this.continuousTimer) {
      clearInterval(this.continuousTimer);
    }
    this.continuousTimer = setInterval(() => {
      const next = this.nextResults.shift();
      if (next) {
        this.scanHistory.push(next);
        onResult(next);
      }
    }, 150);
    return () => {
      if (this.continuousTimer) {
        clearInterval(this.continuousTimer);
        this.continuousTimer = null;
      }
    };
  }

  async stopScan(): Promise<void> {
    if (this.continuousTimer) {
      clearInterval(this.continuousTimer);
      this.continuousTimer = null;
    }
  }

  normalizeInput(raw: string): string {
    return normalizeBarcode(raw);
  }
}

export const createMockScannerAdapter = (): MockScannerAdapter => new MockScannerAdapter();
