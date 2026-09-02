import {
  PRINTER_ERROR_MESSAGE,
  type ReceiptData,
} from '../types';
import {
  ESCPOS,
  EscPosBuilder,
  buildLeftRightText,
  buildReceiptBytes,
  buildTestPrintBytes,
  bytesToAscii,
  containsText,
  getCharsPerLine,
} from '../escpos';
import { MockPrinterAdapter } from '../mockPrinterAdapter';

const FIXED_TIME = new Date(2026, 7, 27, 14, 5, 0).getTime();

const baseReceipt = (overrides: Partial<ReceiptData> = {}): ReceiptData => ({
  storeName: 'Toko Budi',
  storeAddress: 'Jl. Melati No. 10, Jakarta',
  invoiceNo: 'INV-20260827-0001',
  timestamp: FIXED_TIME,
  cashierName: 'Sari',
  items: [
    {
      name: 'Indomie Goreng',
      qty: 3,
      unit: 'pcs',
      unitPrice: 3500,
      discount: 0,
      total: 10500,
    },
    {
      name: 'Teh Pucuk 350ml',
      qty: 2,
      unit: 'pcs',
      unitPrice: 4000,
      discount: 500,
      total: 7500,
    },
    {
      name: 'Beras Pandan Wangi 5kg',
      qty: 1,
      unit: 'karung',
      unitPrice: 75000,
      discount: 0,
      total: 75000,
    },
  ],
  subtotal: 93000,
  discount: 500,
  tax: 0,
  total: 92500,
  payments: [{ method: 'cash', amount: 100000 }],
  footerText: 'Terima kasih sudah belanja',
  ...overrides,
});

describe('EscPosBuilder - primitives', () => {
  it('init menambahkan ESC @ di awal buffer', () => {
    const bytes = new EscPosBuilder().init().build();
    expect(bytes[0]).toBe(ESCPOS.INIT[0]);
    expect(bytes[1]).toBe(ESCPOS.INIT[1]);
  });

  it('align menghasilkan ESC a n yang benar', () => {
    const left = new EscPosBuilder().align(0).build();
    expect(Array.from(left.slice(0, 3))).toEqual(Array.from(ESCPOS.ALIGN_LEFT));
    const center = new EscPosBuilder().align(1).build();
    expect(Array.from(center.slice(0, 3))).toEqual(Array.from(ESCPOS.ALIGN_CENTER));
    const right = new EscPosBuilder().align(2).build();
    expect(Array.from(right.slice(0, 3))).toEqual(Array.from(ESCPOS.ALIGN_RIGHT));
  });

  it('cut menambahkan GS V 0x00 di akhir', () => {
    const bytes = new EscPosBuilder().init().cut().build();
    const tail = Array.from(bytes.slice(-3));
    expect(tail).toEqual(Array.from(ESCPOS.CUT_PARTIAL));
  });

  it('feed menambahkan LF sebanyak n', () => {
    const bytes = new EscPosBuilder().feed(3).build();
    expect(Array.from(bytes)).toEqual([0x0a, 0x0a, 0x0a]);
  });

  it('divider menghasilkan panjang sesuai chars per line', () => {
    const chars58 = getCharsPerLine('58mm');
    const chars80 = getCharsPerLine('80mm');
    expect(chars58).toBe(32);
    expect(chars80).toBe(48);
    const line58 = new EscPosBuilder().divider('-', chars58).build();
    const ascii58 = bytesToAscii(line58).trim();
    expect(ascii58.length).toBe(32);
    const line80 = new EscPosBuilder().divider('-', chars80).build();
    const ascii80 = bytesToAscii(line80).trim();
    expect(ascii80.length).toBe(48);
  });
});

describe('buildReceiptBytes - struk contoh (T2.3)', () => {
  it('menghasilkan buffer ESC/POS yang diawali INIT dan diakhiri CUT', () => {
    const bytes = buildReceiptBytes(baseReceipt(), '58mm');
    expect(bytes[0]).toBe(ESCPOS.INIT[0]);
    expect(bytes[1]).toBe(ESCPOS.INIT[1]);
    const tail = Array.from(bytes.slice(-3));
    expect(tail).toEqual(Array.from(ESCPOS.CUT_PARTIAL));
  });

  it.each([['58mm' as const], ['80mm' as const]])(
    'memuat semua field wajib struk PRD §5.3 pada %s',
    (width) => {
      const data = baseReceipt();
      const bytes = buildReceiptBytes(data, width);
      const ascii = bytesToAscii(bytes);

      expect(containsText(bytes, data.storeName)).toBe(true);
      expect(ascii).toContain(data.storeAddress as string);
      expect(containsText(bytes, data.invoiceNo)).toBe(true);
      expect(containsText(bytes, 'Sari')).toBe(true);
      expect(containsText(bytes, '27/08/2026')).toBe(true);

      expect(containsText(bytes, 'Indomie Goreng')).toBe(true);
      expect(containsText(bytes, 'Teh Pucuk 350ml')).toBe(true);
      expect(containsText(bytes, 'Beras Pandan Wangi 5kg')).toBe(true);

      expect(ascii).toContain('Rp 92.500');
      expect(ascii).toContain('Rp 93.000');
      expect(ascii).toContain('Rp 100.000');
      expect(ascii).toContain('Rp 7.500');

      expect(containsText(bytes, 'Tunai')).toBe(true);
      expect(containsText(bytes, 'Kembalian')).toBe(true);
      expect(ascii).toContain('Rp 7.500');

      expect(containsText(bytes, 'Terima kasih sudah belanja')).toBe(true);
      expect(containsText(bytes, 'tidak dapat ditukar')).toBe(true);
    },
  );

  it('footer default "Terima kasih" bila footer kosong', () => {
    const bytes = buildReceiptBytes(baseReceipt({ footerText: '' }), '58mm');
    expect(containsText(bytes, 'Terima kasih')).toBe(true);
  });

  it('membedakan lebar 58mm (divider 32) vs 80mm (48)', () => {
    const bytes58 = buildReceiptBytes(baseReceipt(), '58mm');
    const bytes80 = buildReceiptBytes(baseReceipt(), '80mm');
    const ascii58 = bytesToAscii(bytes58);
    const ascii80 = bytesToAscii(bytes80);
    const div58 = '-'.repeat(32);
    const div80 = '-'.repeat(48);
    expect(ascii58).toContain(div58);
    expect(ascii80).toContain(div80);
    expect(ascii58).not.toContain(div80);
  });

  it('menampilkan rincian qty x harga satuan dan diskon item', () => {
    const bytes = buildReceiptBytes(baseReceipt(), '58mm');
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain('3 pcs x Rp 3.500');
    expect(ascii).toContain('2 pcs x Rp 4.000');
    expect(ascii).toContain('-Rp 500');
    expect(ascii).toContain('1 karung x Rp 75.000');
  });

  it('split payment: semua metode tercetak dengan label lokal', () => {
    const bytes = buildReceiptBytes(
      baseReceipt({
        payments: [
          { method: 'cash', amount: 50000 },
          { method: 'qris', amount: 30000, reference: 'QR-9988' },
          { method: 'debit', amount: 12500, reference: 'EDC-123' },
        ],
        total: 92500,
      }),
      '58mm',
    );
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain('Tunai');
    expect(ascii).toContain('QRIS');
    expect(ascii).toContain('Debit');
    expect(ascii).toContain('QR-9988');
    expect(ascii).toContain('EDC-123');
    expect(ascii).toContain('Rp 50.000');
    expect(ascii).toContain('Rp 30.000');
  });

  it('transfer-only (tanpa tunai) tidak mencetak baris Kembalian', () => {
    const bytes = buildReceiptBytes(
      baseReceipt({
        payments: [{ method: 'transfer', amount: 92500, reference: 'TRF-001' }],
      }),
      '58mm',
    );
    expect(containsText(bytes, 'Kembalian')).toBe(false);
    expect(containsText(bytes, 'Transfer')).toBe(true);
  });

  it('integer rupiah diformat dengan dot separator tanpa desimal', () => {
    const bytes = buildReceiptBytes(
      baseReceipt({
        items: [
          { name: 'Gula 1kg', qty: 1, unit: 'pcs', unitPrice: 125000, discount: 0, total: 125000 },
        ],
        subtotal: 125000,
        total: 125000,
        payments: [{ method: 'cash', amount: 150000 }],
      }),
      '58mm',
    );
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain('Rp 125.000');
    expect(ascii).toContain('Rp 150.000');
    expect(ascii).toContain('Rp 25.000');
    expect(ascii).not.toContain('Rp 125.000,00');
  });

  it('item name snapshot tetap tercetak apa adanya', () => {
    const bytes = buildReceiptBytes(
      baseReceipt({
        items: [
          {
            name: 'Nama Lama Produk',
            qty: 1,
            unit: 'pcs',
            unitPrice: 10000,
            discount: 0,
            total: 10000,
          },
        ],
        subtotal: 10000,
        total: 10000,
      }),
      '58mm',
    );
    expect(containsText(bytes, 'Nama Lama Produk')).toBe(true);
  });

  it('pajak tampil hanya bila > 0', () => {
    const withTax = buildReceiptBytes(baseReceipt({ tax: 1000 }), '58mm');
    expect(containsText(withTax, 'Pajak')).toBe(true);
    expect(bytesToAscii(withTax)).toContain('Rp 1.000');
    const noTax = buildReceiptBytes(baseReceipt({ tax: 0 }), '58mm');
    expect(containsText(noTax, 'Pajak')).toBe(false);
  });
});

describe('buildTestPrintBytes', () => {
  it('memuat info kertas dan status terhubung', () => {
    const b58 = buildTestPrintBytes('58mm');
    expect(containsText(b58, '58mm')).toBe(true);
    expect(containsText(b58, '32')).toBe(true);
    expect(containsText(b58, 'Printer terhubung')).toBe(true);
    const b80 = buildTestPrintBytes('80mm');
    expect(containsText(b80, '80mm')).toBe(true);
    expect(containsText(b80, '48')).toBe(true);
  });
});

describe('MockPrinterAdapter - mock dipakai test lain (T2.3)', () => {
  it('scan mengembalikan daftar mock devices', async () => {
    const adapter = new MockPrinterAdapter();
    const devices = await adapter.scan();
    expect(devices.length).toBeGreaterThanOrEqual(2);
    expect(devices.some((d) => d.address === '00:11:22:33:44:58')).toBe(true);
  });

  it('print tanpa connect melempar PrinterError dengan pesan actionable', async () => {
    const adapter = new MockPrinterAdapter();
    const bytes = buildReceiptBytes(baseReceipt(), '58mm');
    await expect(adapter.print(bytes)).rejects.toThrow(PRINTER_ERROR_MESSAGE);
    await expect(adapter.print(bytes)).rejects.toMatchObject({ code: 'not_connected' });
  });

  it('connect lalu print menyimpan buffer yang dapat di-assert', async () => {
    const adapter = new MockPrinterAdapter();
    await adapter.connect('00:11:22:33:44:58');
    expect(await adapter.isConnected()).toBe(true);
    expect(adapter.getConnectedDevice()?.address).toBe('00:11:22:33:44:58');
    const bytes = buildReceiptBytes(baseReceipt(), '58mm');
    await adapter.print(bytes);
    const last = adapter.getLastPrinted();
    expect(last).not.toBeNull();
    expect(containsText(last as Uint8Array, 'INV-20260827-0001')).toBe(true);
    expect(adapter.getPrintedBuffers()).toHaveLength(1);
  });

  it('disconnect membuat isConnected false dan print kembali gagal', async () => {
    const adapter = new MockPrinterAdapter();
    await adapter.connect('00:11:22:33:44:58');
    await adapter.disconnect();
    expect(await adapter.isConnected()).toBe(false);
    await expect(adapter.print(new Uint8Array([1, 2]))).rejects.toThrow(PRINTER_ERROR_MESSAGE);
  });

  it('fail next print/connect dapat disimulasikan untuk test error path', async () => {
    const adapter = new MockPrinterAdapter();
    adapter.setFailNextConnect(true);
    await expect(adapter.connect('00:11:22:33:44:58')).rejects.toMatchObject({
      code: 'connection_failed',
    });
    await adapter.connect('00:11:22:33:44:58');
    adapter.setFailNextPrint(true);
    await expect(adapter.print(buildReceiptBytes(baseReceipt(), '58mm'))).rejects.toMatchObject({
      code: 'write_failed',
    });
  });

  it('escpos util helper buildLeftRightText pad sesuai lebar', () => {
    expect(buildLeftRightText('Subtotal', 'Rp 10.000', 32).length).toBe(32);
    expect(buildLeftRightText('Subtotal', 'Rp 10.000', 48).length).toBe(48);
    const truncated = buildLeftRightText('Nama Produk Sangat Panjang Sekali Melebihi Batas', 'Rp 5.000', 32);
    expect(truncated.length).toBe(32);
    expect(truncated).toContain('Rp 5.000');
  });
});
