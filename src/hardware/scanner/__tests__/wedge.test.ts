import { getWedgeMatch } from '../useWedgeScanner';

type FakeProduct = { id: string; barcode: string | null; name: string };

describe('getWedgeMatch - keyboard wedge exact-match', () => {
  const products: FakeProduct[] = [
    { id: 'p1', barcode: '8992761234567', name: 'Indomie Goreng' },
    { id: 'p2', barcode: '8992761000001', name: 'Teh Pucuk 350ml' },
    { id: 'p3', barcode: null, name: 'Beras' },
  ];

  it('finds exact barcode match after trimming', () => {
    expect(getWedgeMatch('  8992761234567  ', products)?.id).toBe('p1');
  });

  it('returns null for unknown barcode', () => {
    expect(getWedgeMatch('0000000000000', products)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(getWedgeMatch('   ', products)).toBeNull();
  });

  it('ignores products with null barcode', () => {
    expect(getWedgeMatch('Beras', products)).toBeNull();
  });

  it('prioritizes exact-match over fuzzy - not fuzzy', () => {
    expect(getWedgeMatch('899276123456', products)).toBeNull();
  });
});
