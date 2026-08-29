import {
  PRODUCT_CSV_HEADERS,
  exportProductsToCsv,
  generateProductCsvTemplate,
  parseCsv,
  parseProductCsv,
} from '../csv';

describe('parseCsv (RFC4180)', () => {
  it('parses simple header + rows', () => {
    const rows = parseCsv('a,b,c\n1,2,3\n4,5,6');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quoted commas and escaped quotes', () => {
    const rows = parseCsv('name,barcode\n"Indomie, Goreng","899""001"""\nTeh,');
    expect(rows).toEqual([
      ['name', 'barcode'],
      ['Indomie, Goreng', '899"001"'],
      ['Teh', ''],
    ]);
  });

  it('handles CRLF and empty trailing newline', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles BOM', () => {
    const rows = parseCsv('\uFEFFa,b\n1,2');
    expect(rows[0]).toEqual(['a', 'b']);
  });

  it('skips blank lines', () => {
    const rows = parseCsv('a,b\n1,2\n\n3,4\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});

describe('generateProductCsvTemplate', () => {
  it('contains expected header', () => {
    const template = generateProductCsvTemplate();
    const firstLine = template.split('\n')[0];
    expect(firstLine).toBe(PRODUCT_CSV_HEADERS.join(','));
  });

  it('contains realistic Indonesian examples', () => {
    const template = generateProductCsvTemplate();
    expect(template).toContain('Indomie Goreng');
    expect(template).toContain('Teh Pucuk');
    expect(template).toContain('Beras Pandan Wangi');
  });
});

describe('exportProductsToCsv', () => {
  it('builds CSV from export items and escapes commas', () => {
    const csv = exportProductsToCsv([
      {
        name: 'Kopi, Susu',
        barcode: '001',
        categoryName: 'Minuman',
        unit: 'pcs',
        customUnitLabel: null,
        costPrice: 5000,
        sellPrice: 7000,
        stock: 10,
        minStock: 2,
        isActive: true,
      },
      {
        name: 'Gula',
        barcode: null,
        categoryName: null,
        unit: 'kg',
        customUnitLabel: null,
        costPrice: 12000,
        sellPrice: 15000,
        stock: 0,
        minStock: 5,
        isActive: false,
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(PRODUCT_CSV_HEADERS.join(','));
    expect(lines[1]).toBe('"Kopi, Susu",001,Minuman,pcs,,5000,7000,10,2,true');
    expect(lines[2]).toBe('Gula,,,kg,,12000,15000,0,5,false');
    // quick check parsing roundtrip is headerValid
    const parsed = parseProductCsv(csv);
    expect(parsed.headerValid).toBe(true);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);
  });
});

describe('parseProductCsv - header & structure', () => {
  it('empty file reports empty_file', () => {
    const result = parseProductCsv('');
    expect(result.headerValid).toBe(false);
    expect(result.errors.some((error) => error.code === 'empty_file')).toBe(true);
  });

  it('invalid header reported', () => {
    const result = parseProductCsv('nama,barcode\nIndomie,123');
    expect(result.headerValid).toBe(false);
    expect(result.errors[0].code).toBe('header_invalid');
    expect(result.rows).toHaveLength(0);
  });

  it('column count mismatch per row reported without failing other rows', () => {
    const header = PRODUCT_CSV_HEADERS.join(',');
    const csv = [header, 'Indomie Goreng,001,Snack,pcs,,2500,3500,10,2,true', 'BadRow,001'].join('\n');
    const result = parseProductCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.errors.some((error) => error.code === 'column_count_mismatch')).toBe(true);
    expect(result.errors[0].row).toBe(3);
  });

  it('header case-insensitive but still valid', () => {
    const header = PRODUCT_CSV_HEADERS.map((column) => column.toUpperCase()).join(',');
    const csv = [header, 'Indomie,123,Snack,pcs,,2500,3500,5,2,true'].join('\n');
    const result = parseProductCsv(csv);
    expect(result.headerValid).toBe(true);
    expect(result.rows).toHaveLength(1);
  });
});

describe('parseProductCsv - field validations (per-baris)', () => {
  const header = PRODUCT_CSV_HEADERS.join(',');

  const makeCsv = (...rows: string[]) => [header, ...rows].join('\n');

  it('parses valid row completely', () => {
    const csv = makeCsv('Indomie Goreng,8998866200011,Makanan Instan,pcs,,2500,3500,48,12,true');
    const result = parseProductCsv(csv);
    expect(result.headerValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    const data = result.rows[0].data;
    expect(data.name).toBe('Indomie Goreng');
    expect(data.barcode).toBe('8998866200011');
    expect(data.category).toBe('Makanan Instan');
    expect(data.unit).toBe('pcs');
    expect(data.customUnitLabel).toBeNull();
    expect(data.costPrice).toBe(2500);
    expect(data.sellPrice).toBe(3500);
    expect(data.stock).toBe(48);
    expect(data.minStock).toBe(12);
    expect(data.isActive).toBe(true);
  });

  it.each([
    ['nama kosong', ',001,Snack,pcs,,2500,3500,5,2,true', 'name_required'],
    ['nama terlalu panjang', `${'a'.repeat(101)},001,Snack,pcs,,2500,3500,5,2,true`, 'name_too_long'],
    ['barcode terlalu panjang', `Kopi,${'a'.repeat(65)},Snack,pcs,,2500,3500,5,2,true`, 'barcode_too_long'],
    ['kategori terlalu panjang', `Kopi,,${'a'.repeat(51)},pcs,,2500,3500,5,2,true`, 'category_too_long'],
    ['unit tidak dikenal', 'Kopi,,Snack,dus,,2500,3500,5,2,true', 'unit_invalid'],
    ['unit kosong', 'Kopi,,Snack,,,2500,3500,5,2,true', 'unit_required'],
    ['HPP negatif', 'Kopi,,Snack,pcs,,-5,3500,5,2,true', 'cost_price_negative'],
    ['HPP bukan integer', 'Kopi,,Snack,pcs,,2500.5,3500,5,2,true', 'cost_price_invalid'],
    ['harga jual nol', 'Kopi,,Snack,pcs,,2500,0,5,2,true', 'sell_price_too_small'],
    ['stok negatif', 'Kopi,,Snack,pcs,,2500,3500,-1,2,true', 'stock_negative'],
    ['min stok bukan angka', 'Kopi,,Snack,pcs,,2500,3500,5,abc,true', 'min_stock_invalid'],
    ['is_active invalid', 'Kopi,,Snack,pcs,,2500,3500,5,2,maybe', 'is_active_invalid'],
  ])('invalid row not inserted: %s', (_label, row, expectedCode) => {
    const csv = makeCsv(row);
    const result = parseProductCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((error) => error.code === expectedCode)).toBe(true);
  });

  it('custom unit label required when unit = custom', () => {
    const csv = makeCsv('Kopi,,Snack,custom,,2500,3500,5,2,true');
    const result = parseProductCsv(csv);
    expect(result.errors.some((error) => error.code === 'custom_label_required')).toBe(true);
  });

  it('custom label hanya untuk unit custom', () => {
    const csv = makeCsv('Kopi,,Snack,pcs,ikat,2500,3500,5,2,true');
    const result = parseProductCsv(csv);
    expect(result.errors.some((error) => error.code === 'custom_label_only_for_custom')).toBe(true);
  });

  it('custom label valid', () => {
    const csv = makeCsv('Kopi,,Snack,custom,ikat,2500,3500,5,2,true');
    const result = parseProductCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].data.customUnitLabel).toBe('ikat');
    expect(result.rows[0].data.unit).toBe('custom');
  });

  it('is_active variations parsed', () => {
    const cases: Array<[string, boolean]> = [
      ['true', true],
      ['1', true],
      ['aktif', true],
      ['false', false],
      ['0', false],
      ['nonaktif', false],
      ['', true],
    ];
    cases.forEach(([raw, expected]) => {
      const csv = makeCsv(`Kopi,,Snack,pcs,,2500,3500,5,2,${raw}`);
      const result = parseProductCsv(csv);
      expect(result.rows[0].data.isActive).toBe(expected);
    });
  });

  it('baris rusak tidak menggagalkan baris lain', () => {
    const csv = makeCsv(
      'Indomie Goreng,001,Snack,pcs,,2500,3500,10,2,true',
      ',002,Snack,pcs,,2500,3500,5,2,true',
      'Teh Pucuk,,Minuman,pcs,,3000,4000,20,5,true',
    );
    const result = parseProductCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
  });

  it('quoted name with commas parsed', () => {
    const csv = makeCsv('"Kopi, Susu",001,Minuman,pcs,,5000,7000,10,2,true');
    const result = parseProductCsv(csv);
    expect(result.rows[0].data.name).toBe('Kopi, Susu');
  });

  it('empty stock reported per row', () => {
    const csv = makeCsv('Kopi,,Snack,pcs,,2500,3500,,2,true');
    const result = parseProductCsv(csv);
    expect(result.errors.some((error) => error.field === 'stock')).toBe(true);
  });
});
