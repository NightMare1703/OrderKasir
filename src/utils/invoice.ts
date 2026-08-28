import dayjs from 'dayjs';

// Nomor invoice sesuai PRD §7.4.2 & GLOSSARY.md §3: `INV-YYYYMMDD-XXXX`
// (tanggal lokal + urutan 4 digit per hari). Tanggal via dayjs (AGENTS.md §3).
export const INVOICE_PREFIX = 'INV';
export const INVOICE_SEQUENCE_LENGTH = 4;
export const INVOICE_MAX_SEQUENCE = 10 ** INVOICE_SEQUENCE_LENGTH - 1;

export const formatInvoiceDate = (timestamp: number): string =>
  dayjs(timestamp).format('YYYYMMDD');

export const buildInvoiceNo = (dateString: string, sequence: number): string => {
  if (!/^\d{8}$/.test(dateString)) {
    throw new Error(`format tanggal invoice tidak valid: ${dateString}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > INVOICE_MAX_SEQUENCE) {
    throw new Error(`urutan invoice di luar rentang: ${sequence}`);
  }
  return `${INVOICE_PREFIX}-${dateString}-${String(sequence).padStart(
    INVOICE_SEQUENCE_LENGTH,
    '0',
  )}`;
};

export type ParsedInvoiceNo = { dateString: string; sequence: number };

export const parseInvoiceNo = (invoiceNo: string): ParsedInvoiceNo | null => {
  const match = new RegExp(`^${INVOICE_PREFIX}-(\\d{8})-(\\d{4})$`).exec(invoiceNo);
  if (!match) {
    return null;
  }
  return { dateString: match[1], sequence: Number(match[2]) };
};

export const invoiceSequenceOf = (invoiceNo: string): number | null =>
  parseInvoiceNo(invoiceNo)?.sequence ?? null;
