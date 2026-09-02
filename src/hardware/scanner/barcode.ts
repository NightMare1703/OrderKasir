import type { SupportedBarcodeFormat } from './types';
import { SUPPORTED_BARCODE_FORMATS } from './types';

export const normalizeBarcode = (raw: string): string => raw.trim();

const isDigits = (value: string): boolean => /^\d+$/.test(value);

const isAlphanumericCode39 = (value: string): boolean => /^[0-9A-Z\-.\s$/+%*]+$/i.test(value);

const isCode128 = (value: string): boolean => value.length >= 2 && /^[\x20-\x7E]+$/.test(value);

export const detectBarcodeFormat = (value: string): SupportedBarcodeFormat | 'unknown' => {
  const trimmed = normalizeBarcode(value);
  if (trimmed === '') {
    return 'unknown';
  }
  if (isDigits(trimmed)) {
    if (trimmed.length === 13) {
      return 'ean13';
    }
    if (trimmed.length === 8) {
      return 'ean8';
    }
    if (trimmed.length === 12) {
      return 'upc_a';
    }
    if (trimmed.length === 6 || trimmed.length === 7) {
      return 'upc_e';
    }
  }
  if (isDigits(trimmed) && (trimmed.length === 13 || trimmed.length === 8 || trimmed.length === 12)) {
    return 'ean13';
  }
  if (isCode128(trimmed) && trimmed.length >= 4) {
    if (isAlphanumericCode39(trimmed) && /^[0-9A-Z\-.\s$/+%*]+$/i.test(trimmed) && trimmed.length <= 43) {
      const looksLikeCode39 = /^[0-9A-Z\-.\s]+$/i.test(trimmed) && trimmed.length <= 20;
      if (looksLikeCode39) {
        return 'code39';
      }
    }
    if (trimmed.length >= 2) {
      return 'code128';
    }
  }
  if (trimmed.length >= 2) {
    return 'qr';
  }
  return 'unknown';
};

export const isSupportedBarcodeFormat = (format: string): format is SupportedBarcodeFormat =>
  (SUPPORTED_BARCODE_FORMATS as readonly string[]).includes(format);

export const isValidBarcode = (raw: string): boolean => {
  const value = normalizeBarcode(raw);
  if (value === '') {
    return false;
  }
  const format = detectBarcodeFormat(value);
  if (format === 'unknown') {
    return false;
  }
  if (format === 'ean13' && (!isDigits(value) || value.length !== 13)) {
    return false;
  }
  if (format === 'ean8' && (!isDigits(value) || value.length !== 8)) {
    return false;
  }
  if (format === 'upc_a' && (!isDigits(value) || value.length !== 12)) {
    return false;
  }
  if (format === 'upc_e' && (!isDigits(value) || (value.length !== 6 && value.length !== 7))) {
    return false;
  }
  return true;
};

export const parseBarcodeInput = (
  raw: string,
): { value: string; format: SupportedBarcodeFormat | 'unknown' } | null => {
  const value = normalizeBarcode(raw);
  if (value === '') {
    return null;
  }
  const format = detectBarcodeFormat(value);
  return { value, format };
};
