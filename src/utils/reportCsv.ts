const escapeCsvField = (value: string): string => {
  const needsQuote =
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r');
  if (!needsQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
};

const buildCsvLine = (fields: Array<string | number>): string =>
  fields.map((field) => escapeCsvField(String(field))).join(',');

const formatDate = (epochMs: number): string => {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export type DailyTrendPoint = {
  date: string;
  omzet: number;
  transactionCount: number;
};

export const buildSalesSummaryCsv = (input: {
  periodLabel: string;
  rangeStart: number;
  rangeEnd: number;
  omzet: number;
  transactionCount: number;
  averageBasket: number;
  discountTotal: number;
  taxTotal: number;
}): string => {
  const header = buildCsvLine([
    'periode',
    'tanggal_mulai',
    'tanggal_selesai',
    'omzet',
    'jumlah_transaksi',
    'rata_basket',
    'diskon_total',
    'pajak_total',
  ]);
  const line = buildCsvLine([
    input.periodLabel,
    formatDate(input.rangeStart),
    formatDate(input.rangeEnd),
    input.omzet,
    input.transactionCount,
    input.averageBasket,
    input.discountTotal,
    input.taxTotal,
  ]);
  return [header, line].join('\n');
};

export const buildPaymentBreakdownCsv = (input: {
  periodLabel: string;
  breakdown: { cash: number; qris: number; debit: number; transfer: number; total: number };
}): string => {
  const header = buildCsvLine(['periode', 'metode', 'jumlah']);
  const rows = [
    buildCsvLine([input.periodLabel, 'cash', input.breakdown.cash]),
    buildCsvLine([input.periodLabel, 'qris', input.breakdown.qris]),
    buildCsvLine([input.periodLabel, 'debit', input.breakdown.debit]),
    buildCsvLine([input.periodLabel, 'transfer', input.breakdown.transfer]),
    buildCsvLine([input.periodLabel, 'total', input.breakdown.total]),
  ];
  return [header, ...rows].join('\n');
};

export const buildDailyTrendCsv = (
  periodLabel: string,
  points: DailyTrendPoint[],
): string => {
  const header = buildCsvLine(['periode', 'tanggal', 'omzet', 'jumlah_transaksi']);
  const rows = points.map((p) =>
    buildCsvLine([periodLabel, p.date, p.omzet, p.transactionCount]),
  );
  return [header, ...rows].join('\n');
};

export const buildProfitSummaryCsv = (input: {
  periodLabel: string;
  omzet: number;
  costTotalEstimate: number;
  grossProfitEstimate: number;
  marginPercent: number | null;
}): string => {
  const header = buildCsvLine([
    'periode',
    'omzet',
    'hpp_estimasi',
    'laba_kotor_estimasi',
    'margin_persen',
  ]);
  const line = buildCsvLine([
    input.periodLabel,
    input.omzet,
    input.costTotalEstimate,
    input.grossProfitEstimate,
    input.marginPercent === null ? '' : input.marginPercent,
  ]);
  return [header, line].join('\n');
};

export const buildTopProductsCsv = (
  periodLabel: string,
  items: Array<{
    productName: string;
    qty: number;
    revenue: number;
    costEstimate: number;
    profitEstimate: number;
  }>,
): string => {
  const header = buildCsvLine([
    'periode',
    'nama_produk',
    'qty',
    'omzet',
    'hpp_estimasi',
    'laba_estimasi',
  ]);
  const rows = items.map((item) =>
    buildCsvLine([
      periodLabel,
      item.productName,
      item.qty,
      item.revenue,
      item.costEstimate,
      item.profitEstimate,
    ]),
  );
  return [header, ...rows].join('\n');
};

export const buildInventoryCsv = (input: {
  totalValue: number;
  totalSku: number;
  totalUnits: number;
  lowStockCount: number;
  products: Array<{
    name: string;
    stock: number;
    costPrice: number;
    value: number;
    minStock: number;
    categoryName: string;
  }>;
}): string => {
  const header = buildCsvLine([
    'nama_produk',
    'kategori',
    'stok',
    'min_stok',
    'hpp',
    'nilai_persediaan',
  ]);
  const summary = buildCsvLine([
    `RINGKASAN: total_nilai=${input.totalValue} total_sku=${input.totalSku} total_unit=${input.totalUnits} stok_menipis=${input.lowStockCount}`,
  ]);
  const rows = input.products.map((p) =>
    buildCsvLine([p.name, p.categoryName, p.stock, p.minStock, p.costPrice, p.value]),
  );
  return [summary, header, ...rows].join('\n');
};

export const buildDebtAgingCsv = (input: {
  totalOutstanding: number;
  outstandingCount: number;
  buckets: Array<{ label: string; count: number; outstanding: number }>;
  perCustomer: Array<{ customerName: string | null; outstanding: number; debtCount: number }>;
}): string => {
  const summaryHeader = buildCsvLine(['total_beredar', 'jumlah_bon']);
  const summaryRow = buildCsvLine([input.totalOutstanding, input.outstandingCount]);

  const bucketHeader = buildCsvLine(['bucket', 'jumlah', 'sisa_piutang']);
  const bucketRows = input.buckets.map((b) =>
    buildCsvLine([b.label, b.count, b.outstanding]),
  );

  const customerHeader = buildCsvLine(['pelanggan', 'sisa_piutang', 'jumlah_bon']);
  const customerRows = input.perCustomer.map((c) =>
    buildCsvLine([c.customerName ?? '-', c.outstanding, c.debtCount]),
  );

  return [
    summaryHeader,
    summaryRow,
    '',
    bucketHeader,
    ...bucketRows,
    '',
    customerHeader,
    ...customerRows,
  ].join('\n');
};

export const buildShiftCsv = (
  shifts: Array<{
    openedAt: number;
    closedAt: number | null;
    userName: string;
    transactionCount: number;
    totalSales: number;
    expectedCash: number | null;
    closingCash: number | null;
    difference: number | null;
    status: string;
  }>,
): string => {
  const header = buildCsvLine([
    'buka',
    'tutup',
    'kasir',
    'status',
    'transaksi',
    'omzet',
    'kas_seharusnya',
    'setoran_fisik',
    'selisih',
  ]);
  const rows = shifts.map((s) =>
    buildCsvLine([
      formatDate(s.openedAt),
      s.closedAt ? formatDate(s.closedAt) : '',
      s.userName,
      s.status,
      s.transactionCount,
      s.totalSales,
      s.expectedCash ?? '',
      s.closingCash ?? '',
      s.difference ?? '',
    ]),
  );
  return [header, ...rows].join('\n');
};

export const csvFileName = (base: string, rangeLabel: string): string => {
  const safe = rangeLabel.replace(/\s+/g, '_').toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  return `${base}_${safe}_${today}.csv`;
};
