import type { PrinterDevice } from './types';

export type PrinterConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface PrinterAdapter {
  scan(): Promise<PrinterDevice[]>;
  connect(address: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  getConnectedDevice(): PrinterDevice | null;
  print(data: Uint8Array): Promise<void>;
  printRaw?(bytes: number[]): Promise<void>;
}

export class PrinterError extends Error {
  readonly code: 'not_connected' | 'connection_failed' | 'write_failed' | 'scan_failed';

  constructor(
    message: string,
    code: PrinterError['code'] = 'not_connected',
  ) {
    super(message);
    this.name = 'PrinterError';
    this.code = code;
  }
}
