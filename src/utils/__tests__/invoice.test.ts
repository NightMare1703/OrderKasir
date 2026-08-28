import {
  buildInvoiceNo,
  formatInvoiceDate,
  invoiceSequenceOf,
  parseInvoiceNo,
} from '../invoice';

describe('formatInvoiceDate', () => {
  it('memformat epoch ms menjadi YYYYMMDD lokal', () => {
    // 27 Agustus 2026 pukul 14.05 WIB (waktu lokal di CI bergantung TZ).
    const ts = new Date(2026, 7, 27, 14, 5, 0).getTime();
    expect(formatInvoiceDate(ts)).toBe('20260827');
  });

  it('memformat awal tahun dengan padding bulan/tanggal', () => {
    const ts = new Date(2026, 0, 3, 0, 0, 0).getTime();
    expect(formatInvoiceDate(ts)).toBe('20260103');
  });
});

describe('buildInvoiceNo & parseInvoiceNo', () => {
  it.each([
    ['20260827', 1, 'INV-20260827-0001'],
    ['20260827', 42, 'INV-20260827-0042'],
    ['20260827', 9999, 'INV-20260827-9999'],
    ['20260103', 100, 'INV-20260103-0100'],
  ])('buildInvoiceNo(%s, %i) -> %s', (date, sequence, expected) => {
    expect(buildInvoiceNo(date, sequence)).toBe(expected);
  });

  it.each([
    ['INV-20260827-0001', { dateString: '20260827', sequence: 1 }],
    ['INV-20260827-1234', { dateString: '20260827', sequence: 1234 }],
  ])('parseInvoiceNo(%s)', (invoiceNo, expected) => {
    expect(parseInvoiceNo(invoiceNo)).toEqual(expected);
    expect(invoiceSequenceOf(invoiceNo)).toBe(expected.sequence);
  });

  it.each(['INV-2026-08-27-0001', '20260827-0001', 'INV-20260827-1', ''])(
    'parseInvoiceNo(%j) -> null',
    invoiceNo => {
      expect(parseInvoiceNo(invoiceNo)).toBeNull();
    },
  );

  it('menolak tanggal dan urutan yang tidak valid', () => {
    expect(() => buildInvoiceNo('2026-08-27', 1)).toThrow();
    expect(() => buildInvoiceNo('20260827', 0)).toThrow();
    expect(() => buildInvoiceNo('20260827', 10000)).toThrow();
    expect(() => buildInvoiceNo('20260827', 1.5)).toThrow();
  });
});
