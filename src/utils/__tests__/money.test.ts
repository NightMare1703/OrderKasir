import { formatRupiah } from '../money';

describe('formatRupiah', () => {
  it.each([
    [0, 'Rp 0'],
    [5, 'Rp 5'],
    [50, 'Rp 50'],
    [500, 'Rp 500'],
    [5000, 'Rp 5.000'],
    [125000, 'Rp 125.000'],
    [1000000, 'Rp 1.000.000'],
    [123456789, 'Rp 123.456.789'],
    [-5000, '\u2212Rp 5.000'],
    [-125000, '\u2212Rp 125.000'],
    [-1, '\u2212Rp 1'],
  ])('formatRupiah(%i) -> %s', (input, expected) => {
    expect(formatRupiah(input)).toBe(expected);
  });

  it.each([1250.5, 0.1, -99.99, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects non-integer amount %p',
    input => {
      expect(() => formatRupiah(input)).toThrow();
    },
  );
});
