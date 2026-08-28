// Logika murni pembayaran tunai (T1.9): input keypad, pecahan shortcut,
// validasi uang kurang, dan perhitungan kembalian — semuanya integer rupiah.
// Unit-test tabel-driven di __tests__/cashPayment.test.ts.

export const CASH_DENOMINATIONS = [20_000, 50_000, 100_000] as const;

export const MAX_CASH_INPUT = 999_999_999;

// Tambah satu digit dari keypad numerik ke nominal yang sedang diketik.
// Digit non-angka diabaikan; input melebihi batas tidak mengubah nilai.
export const appendCashDigit = (current: number, digit: string): number => {
  const d = digit.charCodeAt(0) - '0'.charCodeAt(0);
  if (!(d >= 0 && d <= 9)) {
    return current;
  }
  const next = current * 10 + d;
  return next > MAX_CASH_INPUT ? current : next;
};

export const removeCashDigit = (current: number): number =>
  current < 10 ? 0 : Math.floor(current / 10);

// Tambah nominal (pecahan shortcut) tanpa melewati batas input.
export const addCashAmount = (current: number, amount: number): number =>
  Math.min(current + amount, MAX_CASH_INPUT);

// Kembalian = uang diterima − total bayar. Negatif berarti uang kurang.
export const calculateChange = (total: number, received: number): number =>
  received - total;

export const isCashInsufficient = (total: number, received: number): boolean =>
  received < total;
