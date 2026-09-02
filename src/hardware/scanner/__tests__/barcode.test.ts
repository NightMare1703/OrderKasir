import {
  detectBarcodeFormat,
  isValidBarcode,
  normalizeBarcode,
  parseBarcodeInput,
} from '../barcode';

describe('barcode utils - normalizeBarcode', () => {
  it('trims whitespace', () => {
    expect(normalizeBarcode('  8992761234567  ')).toBe('8992761234567');
  });

  it('empty string returns empty', () => {
    expect(normalizeBarcode('   ')).toBe('');
  });
});

describe('detectBarcodeFormat', () => {
  it.each([
    ['8992761234567', 'ean13'],
    ['12345670', 'ean8'],
    ['123456789012', 'upc_a'],
    ['123456', 'upc_e'],
    ['1234567', 'upc_e'],
  ])('detects %s as %s', (value, expected) => {
    expect(detectBarcodeFormat(value)).toBe(expected);
  });

  it('detects code39 for alphanumeric short', () => {
    expect(detectBarcodeFormat('AB-123')).toBe('code39');
  });

  it('detects code39/code128 for longer ascii', () => {
    const format = detectBarcodeFormat('ABC-123-XYZ-999');
    expect(['code39', 'code128', 'qr']).toContain(format);
  });

  it('detects qr-like content as qr or code128', () => {
    const format = detectBarcodeFormat('https://example.com/qr');
    expect(['qr', 'code128']).toContain(format);
  });

  it('unknown for empty', () => {
    expect(detectBarcodeFormat('')).toBe('unknown');
    expect(detectBarcodeFormat('   ')).toBe('unknown');
  });
});

describe('isValidBarcode', () => {
  it('validates EAN13 length', () => {
    expect(isValidBarcode('8992761234567')).toBe(true);
    expect(isValidBarcode('899276123456')).toBe(true);
  });

  it('validates EAN8 and UPC-E', () => {
    expect(isValidBarcode('12345670')).toBe(true);
    expect(isValidBarcode('1234567')).toBe(true);
  });

  it('rejects empty', () => {
    expect(isValidBarcode('')).toBe(false);
    expect(isValidBarcode('   ')).toBe(false);
  });

  it('accepts QR / code128 style barcodes', () => {
    expect(isValidBarcode('HELLO-QR-123')).toBe(true);
  });
});

describe('parseBarcodeInput', () => {
  it('returns null for empty', () => {
    expect(parseBarcodeInput('   ')).toBeNull();
  });

  it('parses ean13', () => {
    const parsed = parseBarcodeInput(' 8992761234567 ');
    expect(parsed).toEqual({ value: '8992761234567', format: 'ean13' });
  });

  it('trims and preserves value', () => {
    const parsed = parseBarcodeInput('  AB-123  ');
    expect(parsed?.value).toBe('AB-123');
  });
});
