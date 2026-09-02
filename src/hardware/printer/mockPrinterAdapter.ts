import { PRINTER_ERROR_MESSAGE, type PrinterDevice } from './types';
import { PrinterError, type PrinterAdapter } from './adapter';

const MOCK_DEVICES: PrinterDevice[] = [
  { id: 'mock-58', name: 'Printer 58mm Mock', address: '00:11:22:33:44:58' },
  { id: 'mock-80', name: 'Printer 80mm Mock', address: '00:11:22:33:44:80' },
];

export class MockPrinterAdapter implements PrinterAdapter {
  private connectedDevice: PrinterDevice | null = null;

  private readonly printedBuffers: Uint8Array[] = [];

  private shouldFailNextPrint = false;

  private shouldFailNextConnect = false;

  getPrintedBuffers(): Uint8Array[] {
    return [...this.printedBuffers];
  }

  getLastPrinted(): Uint8Array | null {
    return this.printedBuffers[this.printedBuffers.length - 1] ?? null;
  }

  clearBuffers(): void {
    this.printedBuffers.length = 0;
  }

  setFailNextPrint(value: boolean): void {
    this.shouldFailNextPrint = value;
  }

  setFailNextConnect(value: boolean): void {
    this.shouldFailNextConnect = value;
  }

  async scan(): Promise<PrinterDevice[]> {
    return [...MOCK_DEVICES];
  }

  async connect(address: string): Promise<void> {
    if (this.shouldFailNextConnect) {
      this.shouldFailNextConnect = false;
      throw new PrinterError(PRINTER_ERROR_MESSAGE, 'connection_failed');
    }
    const found = MOCK_DEVICES.find((d) => d.address === address) ?? {
      id: address,
      name: `Printer ${address}`,
      address,
    };
    this.connectedDevice = found;
  }

  async disconnect(): Promise<void> {
    this.connectedDevice = null;
  }

  async isConnected(): Promise<boolean> {
    return this.connectedDevice !== null;
  }

  getConnectedDevice(): PrinterDevice | null {
    return this.connectedDevice;
  }

  async print(data: Uint8Array): Promise<void> {
    if (this.shouldFailNextPrint) {
      this.shouldFailNextPrint = false;
      throw new PrinterError(PRINTER_ERROR_MESSAGE, 'write_failed');
    }
    if (!this.connectedDevice) {
      throw new PrinterError(PRINTER_ERROR_MESSAGE, 'not_connected');
    }
    this.printedBuffers.push(Uint8Array.from(data));
  }

  async printRaw(bytes: number[]): Promise<void> {
    await this.print(Uint8Array.from(bytes));
  }
}

export const createMockPrinterAdapter = (): MockPrinterAdapter => new MockPrinterAdapter();
