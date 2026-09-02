import dayjs from 'dayjs';

import { formatRupiah } from '../../utils/money';
import { PAPER_CHARS, type PaperWidth, type ReceiptData } from './types';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export const ESCPOS = {
  INIT: [ESC, 0x40] as const,
  ALIGN_LEFT: [ESC, 0x61, 0x00] as const,
  ALIGN_CENTER: [ESC, 0x61, 0x01] as const,
  ALIGN_RIGHT: [ESC, 0x61, 0x02] as const,
  BOLD_ON: [ESC, 0x45, 0x01] as const,
  BOLD_OFF: [ESC, 0x45, 0x00] as const,
  SIZE_NORMAL: [GS, 0x21, 0x00] as const,
  SIZE_DOUBLE_WIDTH: [GS, 0x21, 0x10] as const,
  SIZE_DOUBLE_HEIGHT: [GS, 0x21, 0x01] as const,
  SIZE_DOUBLE_BOTH: [GS, 0x21, 0x11] as const,
  CUT_PARTIAL: [GS, 0x56, 0x00] as const,
  CUT_FULL: [GS, 0x56, 0x01] as const,
};

const encodeAscii = (text: string): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    bytes.push(code <= 0xff ? code : 0x3f);
  }
  return bytes;
};

const repeat = (byte: number, count: number): number[] => Array.from({ length: count }, () => byte);

export class EscPosBuilder {
  private readonly bytes: number[] = [];

  init(): this {
    this.bytes.push(...ESCPOS.INIT);
    return this;
  }

  align(value: 0 | 1 | 2): this {
    this.bytes.push(ESC, 0x61, value);
    return this;
  }

  bold(on: boolean): this {
    this.bytes.push(...(on ? ESCPOS.BOLD_ON : ESCPOS.BOLD_OFF));
    return this;
  }

  size(mode: number): this {
    this.bytes.push(GS, 0x21, mode);
    return this;
  }

  sizeNormal(): this {
    return this.size(0x00);
  }

  sizeDouble(): this {
    return this.size(0x11);
  }

  text(value: string): this {
    this.bytes.push(...encodeAscii(value));
    return this;
  }

  line(value = ''): this {
    this.bytes.push(...encodeAscii(value), LF);
    return this;
  }

  divider(char = '-', width: number): this {
    this.bytes.push(...encodeAscii(char.repeat(width)), LF);
    return this;
  }

  feed(lines: number): this {
    if (lines <= 0) return this;
    this.bytes.push(...repeat(LF, lines));
    return this;
  }

  cut(): this {
    this.bytes.push(...ESCPOS.CUT_PARTIAL);
    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }

  getBytes(): number[] {
    return [...this.bytes];
  }
}

export const getCharsPerLine = (width: PaperWidth): number => PAPER_CHARS[width];

export const formatReceiptDate = (timestamp: number): string =>
  dayjs(timestamp).format('DD/MM/YYYY HH:mm');

const padRight = (text: string, width: number): string => {
  if (text.length >= width) return text.slice(0, width);
  return text + ' '.repeat(width - text.length);
};

const buildLeftRight = (left: string, right: string, chars: number): string => {
  const space = chars - left.length - right.length;
  if (space < 1) {
    const truncatedLeft = left.slice(0, Math.max(0, chars - right.length - 1));
    return `${truncatedLeft} ${right}`;
  }
  return `${left}${' '.repeat(space)}${right}`;
};

const formatQtyUnit = (qty: number, unit: string): string => `${qty} ${unit}`;

const paymentLabel = (method: string): string => {
  const map: Record<string, string> = {
    cash: 'Tunai',
    qris: 'QRIS',
    debit: 'Debit',
    transfer: 'Transfer',
  };
  return map[method] ?? method;
};

export const buildReceiptBytes = (data: ReceiptData, paperWidth: PaperWidth): Uint8Array => {
  const chars = getCharsPerLine(paperWidth);
  const b = new EscPosBuilder();
  b.init();

  b.align(1).bold(true).sizeDouble().line(data.storeName);
  b.sizeNormal().bold(false);
  if (data.storeAddress) {
    b.align(1).line(data.storeAddress);
  }
  b.divider('-', chars);

  b.align(0).line(`No: ${data.invoiceNo}`);
  b.line(`Tgl: ${formatReceiptDate(data.timestamp)}`);
  b.line(`Kasir: ${data.cashierName}`);
  b.divider('-', chars);

  for (const item of data.items) {
    const left = `${item.name} x${item.qty}`;
    const right = formatRupiah(item.total);
    b.line(buildLeftRight(left, right, chars));
    const detailLeft = `  ${formatQtyUnit(item.qty, item.unit)} x ${formatRupiah(item.unitPrice)}`;
    if (item.discount > 0) {
      b.line(buildLeftRight(detailLeft, `-${formatRupiah(item.discount)}`, chars));
    } else {
      b.line(detailLeft);
    }
  }
  b.divider('-', chars);

  b.line(buildLeftRight('Subtotal', formatRupiah(data.subtotal), chars));
  if (data.discount > 0) {
    b.line(buildLeftRight('Diskon', `-${formatRupiah(data.discount)}`, chars));
  }
  if (data.tax > 0) {
    b.line(buildLeftRight('Pajak', formatRupiah(data.tax), chars));
  }
  b.bold(true).line(buildLeftRight('TOTAL', formatRupiah(data.total), chars));
  b.bold(false);
  b.divider('-', chars);

  for (const p of data.payments) {
    b.line(buildLeftRight(paymentLabel(p.method), formatRupiah(p.amount), chars));
    if (p.reference) {
      b.line(`  Ref: ${p.reference}`);
    }
  }

  const paidSum = data.payments.reduce((sum, p) => sum + p.amount, 0);
  const hasCash = data.payments.some((p) => p.method === 'cash');
  if (hasCash && paidSum >= data.total) {
    const change = paidSum - data.total;
    b.line(buildLeftRight('Bayar', formatRupiah(paidSum), chars));
    b.bold(true).line(buildLeftRight('Kembalian', formatRupiah(change), chars));
    b.bold(false);
  }

  b.divider('-', chars);

  const footer = data.footerText?.trim() ? data.footerText.trim() : 'Terima kasih';
  b.align(1).line(footer);
  b.align(1).line('Barang yang sudah dibeli');
  b.align(1).line('tidak dapat ditukar/dikembalikan');

  b.feed(3).cut();
  return b.build();
};

export const buildTestPrintBytes = (paperWidth: PaperWidth, storeName = 'OrderKasir'): Uint8Array => {
  const chars = getCharsPerLine(paperWidth);
  const b = new EscPosBuilder();
  b.init();
  b.align(1).bold(true).sizeDouble().line(storeName);
  b.sizeNormal().bold(false);
  b.line('Test Print');
  b.divider('-', chars);
  b.align(0).line(`Lebar kertas: ${paperWidth}`);
  b.line(`Karakter/baris: ${chars}`);
  b.line(`Waktu: ${formatReceiptDate(Date.now())}`);
  b.divider('-', chars);
  b.align(1).line('Printer terhubung');
  b.feed(3).cut();
  return b.build();
};

export const bytesToAscii = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((code) => {
      if (code === LF) return '\n';
      if (code >= 32 && code <= 126) return String.fromCharCode(code);
      return '';
    })
    .join('');

export const containsText = (bytes: Uint8Array, text: string): boolean =>
  bytesToAscii(bytes).includes(text);

export const buildLeftRightText = (left: string, right: string, chars: number): string =>
  buildLeftRight(left, right, chars);

export { padRight };
