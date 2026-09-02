export const SUPPORTED_BARCODE_FORMATS = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'qr',
] as const;

export type SupportedBarcodeFormat = (typeof SUPPORTED_BARCODE_FORMATS)[number];

export type ScannerResult = {
  value: string;
  format: SupportedBarcodeFormat | 'unknown';
};

export type ScannerPermissionStatus = 'granted' | 'denied' | 'blocked' | 'unavailable';

export const SCANNER_ERROR_MESSAGE = 'Kamera tidak tersedia. Masukkan barcode secara manual';
