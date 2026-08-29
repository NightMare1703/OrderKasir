import { PRODUCT_UNITS } from '../features/products/schemas';

export const PRODUCT_CSV_HEADERS = [
  'name',
  'barcode',
  'category',
  'unit',
  'custom_unit_label',
  'cost_price',
  'sell_price',
  'stock',
  'min_stock',
  'is_active',
] as const;

export type ProductCsvHeader = (typeof PRODUCT_CSV_HEADERS)[number];

export type ProductCsvRow = {
  name: string;
  barcode: string | null;
  category: string | null;
  unit: (typeof PRODUCT_UNITS)[number];
  customUnitLabel: string | null;
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  isActive: boolean;
};

export type ProductCsvParseError = {
  row: number;
  field?: string;
  code: string;
  message: string;
};

export type ProductCsvParseResult = {
  rows: Array<{ rowNumber: number; data: ProductCsvRow }>;
  errors: ProductCsvParseError[];
  headerValid: boolean;
};

export type ProductCsvExportItem = {
  name: string;
  barcode: string | null;
  categoryName: string | null;
  unit: string;
  customUnitLabel: string | null;
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  isActive: boolean;
};

const BOM = '\uFEFF';

const stripBom = (text: string): string => (text.startsWith(BOM) ? text.slice(1) : text);

const escapeCsvField = (value: string): string => {
  const needsQuote = value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r');
  if (!needsQuote) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
};

const buildCsvLine = (fields: string[]): string => fields.map(escapeCsvField).join(',');

export const generateProductCsvTemplate = (): string => {
  const header = buildCsvLine([...PRODUCT_CSV_HEADERS]);
  const examples: string[][] = [
    ['Indomie Goreng', '8998866200011', 'Makanan Instan', 'pcs', '', '2500', '3500', '48', '12', 'true'],
    ['Teh Pucuk 350ml', '8992388881819', 'Minuman', 'pcs', '', '3000', '4000', '24', '6', 'true'],
    ['Beras Pandan Wangi 5kg', '', 'Bahan Pokok', 'kg', '', '55000', '62000', '10', '5', 'true'],
  ];
  const lines = examples.map(buildCsvLine);
  return [header, ...lines].join('\n');
};

export const exportProductsToCsv = (items: ProductCsvExportItem[]): string => {
  const header = buildCsvLine([...PRODUCT_CSV_HEADERS]);
  const lines = items.map((item) =>
    buildCsvLine([
      item.name,
      item.barcode ?? '',
      item.categoryName ?? '',
      item.unit,
      item.customUnitLabel ?? '',
      String(item.costPrice),
      String(item.sellPrice),
      String(item.stock),
      String(item.minStock),
      item.isActive ? 'true' : 'false',
    ]),
  );
  return [header, ...lines].join('\n');
};

export const parseCsv = (text: string): string[][] => {
  const normalized = stripBom(text);
  if (normalized.trim() === '') {
    return [];
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      if (currentField === '') {
        inQuotes = true;
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (char === '\r' || char === '\n') {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      currentRow.push(currentField);
      const hasContent = currentRow.some((field) => field.trim() !== '' || field !== '');
      const isNotEmpty = currentRow.length > 1 || currentRow[0] !== '';
      if (isNotEmpty || hasContent) {
        const isBlankLine = currentRow.length === 1 && currentRow[0].trim() === '';
        if (!isBlankLine) {
          rows.push(currentRow);
        }
      }
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  const lastIsBlank = currentRow.length === 1 && currentRow[0].trim() === '' && rows.length > 0;
  if (!lastIsBlank) {
    const hasContent = currentRow.some((field) => field !== '');
    if (hasContent) {
      rows.push(currentRow);
    } else if (currentRow.length > 1) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const isValidUnit = (value: string): value is ProductCsvRow['unit'] =>
  (PRODUCT_UNITS as readonly string[]).includes(value);

const parseBooleanField = (raw: string): { value: boolean | null; error: boolean } => {
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') {
    return { value: true, error: false };
  }
  if (['true', '1', 'aktif', 'active', 'ya'].includes(normalized)) {
    return { value: true, error: false };
  }
  if (['false', '0', 'nonaktif', 'inactive', 'tidak aktif', 'tidak'].includes(normalized)) {
    return { value: false, error: false };
  }
  return { value: null, error: true };
};

const parseIntegerField = (raw: string): { value: number | null; error: boolean } => {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { value: null, error: true };
  }
  if (!/^-?\d+$/.test(trimmed)) {
    return { value: null, error: true };
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed)) {
    return { value: null, error: true };
  }
  return { value: parsed, error: false };
};

export const parseProductCsv = (text: string): ProductCsvParseResult => {
  const errors: ProductCsvParseError[] = [];
  const rows: Array<{ rowNumber: number; data: ProductCsvRow }> = [];

  const rawRows = parseCsv(text);

  if (rawRows.length === 0) {
    errors.push({ row: 1, code: 'empty_file', message: 'File CSV kosong' });
    return { rows, errors, headerValid: false };
  }

  const headerRow = rawRows[0].map((cell) => cell.trim().toLowerCase());
  const expectedLower = [...PRODUCT_CSV_HEADERS].map((header) => header.toLowerCase());
  const headerValid =
    headerRow.length === expectedLower.length && headerRow.every((cell, index) => cell === expectedLower[index]);

  if (!headerValid) {
    errors.push({
      row: 1,
      code: 'header_invalid',
      message: `Header tidak valid. Harus: ${PRODUCT_CSV_HEADERS.join(',')}`,
    });
    return { rows, errors, headerValid: false };
  }

  for (let index = 1; index < rawRows.length; index += 1) {
    const rowNumber = index + 1;
    const cells = rawRows[index];

    if (cells.length === 1 && cells[0].trim() === '') {
      continue;
    }

    if (cells.length !== PRODUCT_CSV_HEADERS.length) {
      errors.push({
        row: rowNumber,
        code: 'column_count_mismatch',
        message: `Jumlah kolom harus ${PRODUCT_CSV_HEADERS.length}, got ${cells.length}`,
      });
      continue;
    }

    const record: Record<string, string> = {};
    PRODUCT_CSV_HEADERS.forEach((header, headerIndex) => {
      record[header] = cells[headerIndex] ?? '';
    });

    let hasRowError = false;
    const pushRowError = (field: string, code: string, message: string) => {
      errors.push({ row: rowNumber, field, code, message });
      hasRowError = true;
    };

    const name = record.name.trim();
    if (name.length === 0) {
      pushRowError('name', 'name_required', 'Nama wajib diisi');
    } else if (name.length > 100) {
      pushRowError('name', 'name_too_long', 'Nama maksimal 100 karakter');
    }

    const barcodeRaw = record.barcode.trim();
    let barcode: string | null = null;
    if (barcodeRaw !== '') {
      if (barcodeRaw.length > 64) {
        pushRowError('barcode', 'barcode_too_long', 'Barcode maksimal 64 karakter');
      } else {
        barcode = barcodeRaw;
      }
    }

    const categoryRaw = record.category.trim();
    let category: string | null = null;
    if (categoryRaw !== '') {
      if (categoryRaw.length > 50) {
        pushRowError('category', 'category_too_long', 'Kategori maksimal 50 karakter');
      } else {
        category = categoryRaw;
      }
    }

    const unitRaw = record.unit.trim().toLowerCase();
    let unit: ProductCsvRow['unit'] | null = null;
    if (unitRaw === '') {
      pushRowError('unit', 'unit_required', 'Satuan wajib diisi');
    } else if (!isValidUnit(unitRaw)) {
      pushRowError('unit', 'unit_invalid', `Satuan tidak dikenal: ${unitRaw}`);
    } else {
      unit = unitRaw as ProductCsvRow['unit'];
    }

    const customRaw = record.custom_unit_label.trim();
    let customUnitLabel: string | null = customRaw === '' ? null : customRaw;
    if (customUnitLabel !== null && customUnitLabel.length > 20) {
      pushRowError('custom_unit_label', 'custom_label_too_long', 'Label custom maksimal 20 karakter');
    }
    if (customUnitLabel !== null && unit !== 'custom' && unit !== null) {
      pushRowError('custom_unit_label', 'custom_label_only_for_custom', 'custom_unit_label hanya untuk unit custom');
    }
    if (unit === 'custom' && (customUnitLabel === null || customUnitLabel === '')) {
      pushRowError('custom_unit_label', 'custom_label_required', 'Label custom wajib untuk unit custom');
    }
    if (unit !== 'custom') {
      customUnitLabel = null;
    }

    const costParsed = parseIntegerField(record.cost_price);
    let costPrice: number | null = null;
    if (costParsed.error || costParsed.value === null) {
      pushRowError('cost_price', 'cost_price_invalid', 'HPP harus integer >= 0');
    } else if (costParsed.value < 0) {
      pushRowError('cost_price', 'cost_price_negative', 'HPP tidak boleh negatif');
    } else {
      costPrice = costParsed.value;
    }

    const sellParsed = parseIntegerField(record.sell_price);
    let sellPrice: number | null = null;
    if (sellParsed.error || sellParsed.value === null) {
      pushRowError('sell_price', 'sell_price_invalid', 'Harga jual harus integer >= 1');
    } else if (sellParsed.value < 1) {
      pushRowError('sell_price', 'sell_price_too_small', 'Harga jual minimal 1');
    } else {
      sellPrice = sellParsed.value;
    }

    const stockParsed = parseIntegerField(record.stock);
    let stock: number | null = null;
    if (stockParsed.error || stockParsed.value === null) {
      pushRowError('stock', 'stock_invalid', 'Stok harus integer >= 0');
    } else if (stockParsed.value < 0) {
      pushRowError('stock', 'stock_negative', 'Stok tidak boleh negatif');
    } else {
      stock = stockParsed.value;
    }

    const minParsed = parseIntegerField(record.min_stock);
    let minStock: number | null = null;
    if (minParsed.error || minParsed.value === null) {
      pushRowError('min_stock', 'min_stock_invalid', 'Stok minimum harus integer >= 0');
    } else if (minParsed.value < 0) {
      pushRowError('min_stock', 'min_stock_negative', 'Stok minimum tidak boleh negatif');
    } else {
      minStock = minParsed.value;
    }

    const boolParsed = parseBooleanField(record.is_active);
    let isActive: boolean | null = null;
    if (boolParsed.error || boolParsed.value === null) {
      pushRowError('is_active', 'is_active_invalid', 'is_active harus true/false');
    } else {
      isActive = boolParsed.value;
    }

    if (hasRowError) {
      continue;
    }

    rows.push({
      rowNumber,
      data: {
        name: name as string,
        barcode,
        category,
        unit: unit as ProductCsvRow['unit'],
        customUnitLabel,
        costPrice: costPrice as number,
        sellPrice: sellPrice as number,
        stock: stock as number,
        minStock: minStock as number,
        isActive: isActive as boolean,
      },
    });
  }

  return { rows, errors, headerValid: true };
};
