const MINUS_SIGN = '\u2212';

const formatThousands = (amount: number): string =>
  amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const formatRupiah = (amount: number): string => {
  if (!Number.isInteger(amount)) {
    throw new Error(`formatRupiah expects integer rupiah, got: ${amount}`);
  }
  const prefix = amount < 0 ? `${MINUS_SIGN}Rp ` : 'Rp ';
  return `${prefix}${formatThousands(Math.abs(amount))}`;
};
