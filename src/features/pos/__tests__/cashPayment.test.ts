import {
  addCashAmount,
  appendCashDigit,
  CASH_DENOMINATIONS,
  calculateChange,
  isCashInsufficient,
  MAX_CASH_INPUT,
  removeCashDigit,
} from '../cashPayment';

describe('appendCashDigit (keypad numerik)', () => {
  it.each([
    [0, '1', 1],
    [0, '9', 9],
    [1, '0', 10],
    [12, '3', 123],
    [999, '9', 9999],
  ] as const)('dari %p + digit %p => %p', (current, digit, expected) => {
    expect(appendCashDigit(current, digit)).toBe(expected);
  });

  it('mengabaikan input non-angka', () => {
    expect(appendCashDigit(12, 'x')).toBe(12);
    expect(appendCashDigit(12, '')).toBe(12);
    expect(appendCashDigit(12, '.')).toBe(12);
  });

  it('tidak melewati batas maksimal input', () => {
    expect(appendCashDigit(MAX_CASH_INPUT, '1')).toBe(MAX_CASH_INPUT);
    expect(appendCashDigit(99_999_999, '9')).toBe(MAX_CASH_INPUT);
  });
});

describe('removeCashDigit', () => {
  it.each([
    [0, 0],
    [5, 0],
    [12, 1],
    [100_000, 10_000],
  ] as const)('dari %p => %p', (current, expected) => {
    expect(removeCashDigit(current)).toBe(expected);
  });
});

describe('addCashAmount (pecahan shortcut)', () => {
  it.each([
    [0, 20_000, 20_000],
    [30_000, 50_000, 80_000],
    [0, 100_000, 100_000],
    [MAX_CASH_INPUT - 1_000, 20_000, MAX_CASH_INPUT],
  ] as const)('dari %p + %p => %p', (current, amount, expected) => {
    expect(addCashAmount(current, amount)).toBe(expected);
  });
});

describe('calculateChange (kembalian)', () => {
  it.each([
    [50_000, 50_000, 0],
    [50_000, 100_000, 50_000],
    [18_000, 20_000, 2_000],
    [100_000, 20_000, -80_000],
    [0, 0, 0],
  ] as const)('total %p, diterima %p => kembalian %p', (total, received, expected) => {
    expect(calculateChange(total, received)).toBe(expected);
  });
});

describe('isCashInsufficient (validasi uang kurang)', () => {
  it.each([
    [50_000, 20_000, true],
    [50_000, 50_000, false],
    [50_000, 100_000, false],
    [0, 0, false],
  ] as const)('total %p, diterima %p => kurang? %p', (total, received, expected) => {
    expect(isCashInsufficient(total, received)).toBe(expected);
  });
});

describe('CASH_DENOMINATIONS', () => {
  it('menyediakan pecahan 20rb, 50rb, dan 100rb', () => {
    expect(CASH_DENOMINATIONS).toEqual([20_000, 50_000, 100_000]);
  });
});
