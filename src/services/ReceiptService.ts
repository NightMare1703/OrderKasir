import { Database, Q } from '@nozbe/watermelondb';

import Payment from '../database/models/payment';
import Setting from '../database/models/setting';
import Transaction from '../database/models/transaction';
import TransactionItem from '../database/models/transaction-item';
import User from '../database/models/user';
import type { PrinterAdapter } from '../hardware/printer/adapter';
import { MockPrinterAdapter } from '../hardware/printer/mockPrinterAdapter';
import { buildReceiptBytes, bytesToAscii } from '../hardware/printer/escpos';
import {
  PRINTER_ERROR_MESSAGE,
  PRINTER_SETTINGS_KEYS,
  type PaperWidth,
  type ReceiptData,
} from '../hardware/printer/types';

const STORE_NAME_KEY = 'store_name';
const STORE_ADDRESS_KEY = 'store_address';
const RECEIPT_FOOTER_KEY = 'receipt_footer';

const DEFAULT_STORE_NAME = 'OrderKasir';
const DEFAULT_PAPER_WIDTH: PaperWidth = '58mm';

const parseSettingValue = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') {
      return parsed;
    }
  } catch {
    // raw is plain string
  }
  return raw;
};

const isPaperWidth = (value: string): value is PaperWidth =>
  value === '58mm' || value === '80mm';

export type ReceiptPrintResult =
  | { status: 'ok'; copies: number }
  | { status: 'not_found'; transactionId: string }
  | { status: 'error'; code: string; message: string };

export class ReceiptService {
  private readonly database: Database;

  private readonly adapter: PrinterAdapter;

  constructor(database: Database, adapter: PrinterAdapter = new MockPrinterAdapter()) {
    this.database = database;
    this.adapter = adapter;
  }

  getAdapter(): PrinterAdapter {
    return this.adapter;
  }

  async getReceiptData(transactionId: string): Promise<ReceiptData | null> {
    let transaction: Transaction;
    try {
      transaction = await this.database.get<Transaction>('transactions').find(transactionId);
    } catch {
      return null;
    }
    if ((transaction._getRaw('deleted') as boolean) === true) {
      return null;
    }

    const [items, payments, settingsRows] = await Promise.all([
      this.database
        .get<TransactionItem>('transaction_items')
        .query(Q.where('transaction_id', transaction.id), Q.where('deleted', false))
        .fetch(),
      this.database
        .get<Payment>('payments')
        .query(Q.where('transaction_id', transaction.id), Q.where('deleted', false))
        .fetch(),
      this.database.get<Setting>('settings').query().fetch().catch(() => [] as Setting[]),
    ]);

    const findSetting = (key: string): string | null => {
      const row = settingsRows.find((r) => r.key === key);
      if (!row) return null;
      const parsed = parseSettingValue(row.value);
      const trimmed = parsed.trim();
      return trimmed === '' ? null : parsed;
    };

    const storeName = findSetting(STORE_NAME_KEY) ?? DEFAULT_STORE_NAME;
    const storeAddress = findSetting(STORE_ADDRESS_KEY);
    const footerText = findSetting(RECEIPT_FOOTER_KEY);

    let cashierName: string = transaction.userId;
    try {
      const user = await this.database.get<User>('users').find(transaction.userId);
      if (!(user._getRaw('deleted') as boolean) && user.name) {
        cashierName = user.name;
      }
    } catch {
      // fallback to userId
    }

    return {
      storeName,
      storeAddress,
      invoiceNo: transaction.invoiceNo,
      timestamp: transaction.createdAt,
      cashierName,
      items: items.map((item) => ({
        name: item.productNameSnapshot,
        qty: item.qty,
        unit: item.unitSnapshot,
        unitPrice: item.unitPrice,
        discount: item.discount,
        total: item.total,
      })),
      subtotal: transaction.subtotal,
      discount: transaction.discount,
      tax: transaction.tax,
      total: transaction.total,
      payments: payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference,
      })),
      footerText,
    };
  }

  async getReceiptDataByInvoiceNo(invoiceNo: string): Promise<{ data: ReceiptData; transactionId: string } | null> {
    const rows = await this.database
      .get<Transaction>('transactions')
      .query(Q.where('invoice_no', invoiceNo), Q.where('deleted', false))
      .fetch();
    if (rows.length === 0) return null;
    const transaction = rows[0];
    const data = await this.getReceiptData(transaction.id);
    if (!data) return null;
    return { data, transactionId: transaction.id };
  }

  async buildReceiptBytes(transactionId: string): Promise<Uint8Array | null> {
    const data = await this.getReceiptData(transactionId);
    if (!data) return null;
    const paperWidth = await this.getPaperWidth();
    return buildReceiptBytes(data, paperWidth);
  }

  async buildReceiptBytesWithData(
    data: ReceiptData,
    paperWidth?: PaperWidth,
  ): Promise<Uint8Array> {
    const width = paperWidth ?? (await this.getPaperWidth());
    return buildReceiptBytes(data, width);
  }

  async buildShareText(transactionId: string): Promise<string | null> {
    const bytes = await this.buildReceiptBytes(transactionId);
    if (!bytes) return null;
    return bytesToAscii(bytes).trim();
  }

  async buildShareTextFromBytes(bytes: Uint8Array): Promise<string> {
    return bytesToAscii(bytes).trim();
  }

  async printReceipt(transactionId: string): Promise<ReceiptPrintResult> {
    const data = await this.getReceiptData(transactionId);
    if (!data) {
      return { status: 'not_found', transactionId };
    }

    const paperWidth = await this.getPaperWidth();
    const bytes = buildReceiptBytes(data, paperWidth);
    const copyCount = await this.getCopyCount();

    const connected = await this.adapter.isConnected();
    if (!connected) {
      const defaultAddr = await this.getDefaultPrinterAddress();
      if (defaultAddr) {
        try {
          await this.adapter.connect(defaultAddr);
        } catch (error) {
          const code = (error as { code?: string })?.code ?? 'connection_failed';
          const message = (error as Error)?.message ?? PRINTER_ERROR_MESSAGE;
          return { status: 'error', code, message };
        }
      }
    }

    const stillConnected = await this.adapter.isConnected();
    if (!stillConnected) {
      return { status: 'error', code: 'not_connected', message: PRINTER_ERROR_MESSAGE };
    }

    try {
      for (let copy = 0; copy < copyCount; copy += 1) {
        await this.adapter.print(bytes);
      }
      return { status: 'ok', copies: copyCount };
    } catch (error) {
      const code = (error as { code?: string })?.code ?? 'write_failed';
      const message = (error as Error)?.message ?? PRINTER_ERROR_MESSAGE;
      return { status: 'error', code, message };
    }
  }

  private async getPaperWidth(): Promise<PaperWidth> {
    const rows = await this.database
      .get<Setting>('settings')
      .query(Q.where('key', PRINTER_SETTINGS_KEYS.paperWidth))
      .fetch();
    if (rows.length === 0) return DEFAULT_PAPER_WIDTH;
    const raw = parseSettingValue(rows[0].value);
    if (isPaperWidth(raw)) return raw;
    return DEFAULT_PAPER_WIDTH;
  }

  private async getCopyCount(): Promise<number> {
    const rows = await this.database
      .get<Setting>('settings')
      .query(Q.where('key', PRINTER_SETTINGS_KEYS.copyCount))
      .fetch();
    if (rows.length === 0) return 1;
    const raw = parseSettingValue(rows[0].value);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.min(parsed, 5);
  }

  private async getDefaultPrinterAddress(): Promise<string | null> {
    const rows = await this.database
      .get<Setting>('settings')
      .query(Q.where('key', PRINTER_SETTINGS_KEYS.defaultAddress))
      .fetch();
    if (rows.length === 0) return null;
    const raw = parseSettingValue(rows[0].value);
    if (raw.trim() === '') return null;
    return raw;
  }
}
