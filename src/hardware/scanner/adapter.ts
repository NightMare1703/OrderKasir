import type { ScannerResult } from './types';

export type ScannerConnectionState = 'idle' | 'scanning' | 'error';

export interface ScannerAdapter {
  isCameraAvailable(): Promise<boolean>;
  requestCameraPermission(): Promise<boolean>;
  scanOnce(): Promise<ScannerResult | null>;
  startContinuousScan(onResult: (result: ScannerResult) => void): () => void;
  stopScan(): Promise<void>;
  normalizeInput(raw: string): string;
}

export class ScannerError extends Error {
  readonly code: 'permission_denied' | 'camera_unavailable' | 'scan_failed';

  constructor(message: string, code: ScannerError['code'] = 'scan_failed') {
    super(message);
    this.name = 'ScannerError';
    this.code = code;
  }
}
