export type PaperWidth = '58mm' | '80mm';

export type ReceiptPaymentInput = {
  method: string;
  amount: number;
  reference?: string | null;
};

export type ReceiptItemInput = {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  discount: number;
  total: number;
};

export type ReceiptData = {
  storeName: string;
  storeAddress?: string | null;
  invoiceNo: string;
  timestamp: number;
  cashierName: string;
  items: ReceiptItemInput[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: ReceiptPaymentInput[];
  footerText?: string | null;
};

export type PrinterDevice = {
  id: string;
  name: string;
  address: string;
};

export const PRINTER_ERROR_MESSAGE = 'Printer tidak terhubung. Periksa bluetooth lalu coba lagi';

export const PAPER_CHARS: Record<PaperWidth, number> = {
  '58mm': 32,
  '80mm': 48,
};

export const PRINTER_SETTINGS_KEYS = {
  defaultAddress: 'printer_default_address',
  defaultName: 'printer_default_name',
  paperWidth: 'printer_paper_width',
  copyCount: 'printer_copy_count',
} as const;
