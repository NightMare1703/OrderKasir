import {
  calculateCartTotals,
  calculateItemDiscountAmount,
  calculateItemSubtotal,
  calculateTransactionDiscountAmount,
  useCartStore,
} from '../cartStore';
import type { CartItem, CartProduct, DiscountValue } from '../cartStore';

const makeProduct = (overrides: Partial<CartProduct> = {}): CartProduct => ({
  id: overrides.id ?? 'p1',
  name: overrides.name ?? 'Indomie Goreng',
  unit: overrides.unit ?? 'pcs',
  customUnitLabel: overrides.customUnitLabel ?? null,
  sellPrice: overrides.sellPrice ?? 3500,
});

const resetStore = () => {
  useCartStore.setState({ items: [], transactionDiscount: null });
};

describe('calculateItemSubtotal', () => {
  it.each([
    [2, 3500, 7000],
    [1, 125000, 125000],
    [0, 3500, 0],
  ] as const)('qty %p x price %p = %p', (qty, unitPrice, expected) => {
    expect(calculateItemSubtotal({ qty, unitPrice } as CartItem)).toBe(expected);
  });
});

describe('calculateItemDiscountAmount', () => {
  it.each([
    [{ qty: 2, unitPrice: 5000, discount: { kind: 'amount', value: 2000 } }, 2000],
    [{ qty: 2, unitPrice: 5000, discount: { kind: 'percent', value: 10 } }, 1000],
    [{ qty: 3, unitPrice: 3333, discount: { kind: 'percent', value: 10 } }, 999],
    [{ qty: 1, unitPrice: 10000, discount: { kind: 'percent', value: 100 } }, 10000],
    [{ qty: 1, unitPrice: 10000, discount: null }, 0],
  ] as const)('item %p => discount %p', (raw, expected) => {
    const item = raw as unknown as CartItem;
    expect(calculateItemDiscountAmount(item)).toBe(expected);
  });
});

describe('calculateTransactionDiscountAmount', () => {
  it.each([
    [10000, { kind: 'amount', value: 2000 }, 2000],
    [10000, { kind: 'percent', value: 10 }, 1000],
    [9999, { kind: 'percent', value: 10 }, 999],
    [5000, null, 0],
  ] as const)('after %p + discount %p = %p', (after, discount, expected) => {
    expect(calculateTransactionDiscountAmount(after, discount as DiscountValue | null)).toBe(
      expected,
    );
  });
});

describe('calculateCartTotals - stacking tabel-driven', () => {
  it.each([
    {
      label: 'tanpa diskon: 2 item',
      items: [
        { qty: 2, unitPrice: 5000, discount: null },
        { qty: 1, unitPrice: 3000, discount: null },
      ] as CartItem[],
      tx: null,
      expected: { subtotal: 13000, itemDiscountTotal: 0, transactionDiscountAmount: 0, total: 13000 },
    },
    {
      label: 'diskon item amount + percent',
      items: [
        { qty: 2, unitPrice: 5000, discount: { kind: 'amount', value: 1000 } },
        { qty: 1, unitPrice: 10000, discount: { kind: 'percent', value: 10 } },
      ] as CartItem[],
      tx: null,
      expected: { subtotal: 20000, itemDiscountTotal: 2000, transactionDiscountAmount: 0, total: 18000 },
    },
    {
      label: 'diskon item lalu diskon transaksi percent',
      items: [
        { qty: 2, unitPrice: 5000, discount: { kind: 'percent', value: 10 } },
      ] as CartItem[],
      tx: { kind: 'percent', value: 10 } as DiscountValue,
      expected: { subtotal: 10000, itemDiscountTotal: 1000, transactionDiscountAmount: 900, total: 8100 },
    },
    {
      label: 'diskon item lalu diskon transaksi amount',
      items: [
        { qty: 1, unitPrice: 20000, discount: { kind: 'amount', value: 5000 } },
      ] as CartItem[],
      tx: { kind: 'amount', value: 3000 } as DiscountValue,
      expected: { subtotal: 20000, itemDiscountTotal: 5000, transactionDiscountAmount: 3000, total: 12000 },
    },
    {
      label: 'multi item + tx percent rounding floor',
      items: [
        { qty: 3, unitPrice: 3333, discount: null },
      ] as CartItem[],
      tx: { kind: 'percent', value: 10 } as DiscountValue,
      expected: { subtotal: 9999, itemDiscountTotal: 0, transactionDiscountAmount: 999, total: 9000 },
    },
  ])('$label', ({ items, tx, expected }) => {
    const totals = calculateCartTotals(items, tx);
    expect(totals.subtotal).toBe(expected.subtotal);
    expect(totals.itemDiscountTotal).toBe(expected.itemDiscountTotal);
    expect(totals.transactionDiscountAmount).toBe(expected.transactionDiscountAmount);
    expect(totals.total).toBe(expected.total);
  });
});

describe('cartStore - add/edit qty/hapus/item note (T1.5)', () => {
  beforeEach(resetStore);

  it('addItem menambah produk baru dan increment qty bila produk sama', () => {
    const p = makeProduct({ id: 'p1', sellPrice: 3500 });
    const store = useCartStore.getState();
    store.addItem(p, 2);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].qty).toBe(2);

    useCartStore.getState().addItem(p, 1);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].qty).toBe(3);
    expect(useCartStore.getState().getItemCount()).toBe(3);
  });

  it('addItem menolak qty tidak valid dan produk tidak valid', () => {
    const p = makeProduct({ id: 'p1' });
    useCartStore.getState().addItem(p, 0);
    expect(useCartStore.getState().items).toHaveLength(0);
    useCartStore.getState().addItem(p, -1);
    expect(useCartStore.getState().items).toHaveLength(0);
    useCartStore.getState().addItem({ ...p, id: '' }, 1);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('updateQty mengubah qty dan memblokir qty <=0 atau non-integer', () => {
    const p = makeProduct({ id: 'p1', sellPrice: 10000 });
    useCartStore.getState().addItem(p, 2);
    expect(useCartStore.getState().updateQty('p1', 5)).toBe(true);
    expect(useCartStore.getState().items[0].qty).toBe(5);
    expect(useCartStore.getState().updateQty('p1', 0)).toBe(false);
    expect(useCartStore.getState().items[0].qty).toBe(5);
    expect(useCartStore.getState().updateQty('p1', 1.5)).toBe(false);
    expect(useCartStore.getState().items[0].qty).toBe(5);
    expect(useCartStore.getState().updateQty('tidak-ada', 1)).toBe(false);
  });

  it('updateQty diblokir bila diskon amount existing melebihi subtotal baru', () => {
    const p = makeProduct({ id: 'p1', sellPrice: 10000 });
    useCartStore.getState().addItem(p, 2);
    expect(useCartStore.getState().setItemDiscount('p1', { kind: 'amount', value: 15000 })).toBe(
      true,
    );
    expect(useCartStore.getState().updateQty('p1', 1)).toBe(false);
    expect(useCartStore.getState().items[0].qty).toBe(2);
  });

  it('removeItem menghapus item', () => {
    const p1 = makeProduct({ id: 'p1' });
    const p2 = makeProduct({ id: 'p2', name: 'Teh Pucuk 350ml' });
    useCartStore.getState().addItem(p1, 1);
    useCartStore.getState().addItem(p2, 1);
    useCartStore.getState().removeItem('p1');
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].productId).toBe('p2');
  });

  it('setItemNote menyimpan catatan dan menormalisasi kosong menjadi null', () => {
    const p = makeProduct({ id: 'p1' });
    useCartStore.getState().addItem(p, 1);
    useCartStore.getState().setItemNote('p1', '  tanpa cabai  ');
    expect(useCartStore.getState().items[0].note).toBe('tanpa cabai');
    useCartStore.getState().setItemNote('p1', '   ');
    expect(useCartStore.getState().items[0].note).toBeNull();
    useCartStore.getState().setItemNote('p1', null);
    expect(useCartStore.getState().items[0].note).toBeNull();
  });

  it('clearCart mengosongkan keranjang dan diskon transaksi', () => {
    const p = makeProduct({ id: 'p1' });
    useCartStore.getState().addItem(p, 1);
    useCartStore.getState().setTransactionDiscount({ kind: 'amount', value: 500 });
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().transactionDiscount).toBeNull();
    expect(useCartStore.getState().isEmpty()).toBe(true);
  });
});

describe('cartStore - diskon item Rp/% (T1.5)', () => {
  beforeEach(resetStore);

  it.each([
    ['amount valid', 'p1', 10000, { kind: 'amount', value: 2000 }, true, 2000],
    ['percent valid 10%', 'p1', 10000, { kind: 'percent', value: 10 }, true, 1000],
    ['percent 100% valid', 'p1', 5000, { kind: 'percent', value: 100 }, true, 5000],
    ['amount melebihi subtotal diblokir', 'p1', 5000, { kind: 'amount', value: 6000 }, false, 0],
    ['percent >100 diblokir', 'p1', 5000, { kind: 'percent', value: 101 }, false, 0],
    ['percent desimal diblokir', 'p1', 5000, { kind: 'percent', value: 10.5 }, false, 0],
  ] as const)(
    'setItemDiscount %s',
    (_label, productId, sellPrice, discount, shouldSucceed, expectedAmount) => {
      const p = makeProduct({ id: productId, sellPrice });
      useCartStore.getState().addItem(p, 1);
      const result = useCartStore
        .getState()
        .setItemDiscount(productId, discount as DiscountValue);
      expect(result).toBe(shouldSucceed);
      const item = useCartStore.getState().items.find((it) => it.productId === productId);
      if (shouldSucceed) {
        expect(calculateItemDiscountAmount(item as CartItem)).toBe(expectedAmount);
      } else {
        expect(item?.discount).toBeNull();
      }
      resetStore();
    },
  );

  it('diskon item null menghapus diskon', () => {
    const p = makeProduct({ id: 'p1', sellPrice: 10000 });
    useCartStore.getState().addItem(p, 1);
    useCartStore.getState().setItemDiscount('p1', { kind: 'amount', value: 1000 });
    expect(useCartStore.getState().items[0].discount).not.toBeNull();
    expect(useCartStore.getState().setItemDiscount('p1', null)).toBe(true);
    expect(useCartStore.getState().items[0].discount).toBeNull();
  });
});

describe('cartStore - diskon transaksi Rp/% stacking (T1.5)', () => {
  beforeEach(resetStore);

  it.each([
    [
      'tx amount valid setelah item discount',
      [{ sellPrice: 20000, qty: 1, itemDiscount: { kind: 'amount', value: 5000 } }],
      { kind: 'amount', value: 3000 },
      true,
      3000,
      12000,
    ],
    [
      'tx percent valid',
      [{ sellPrice: 10000, qty: 1, itemDiscount: null }],
      { kind: 'percent', value: 10 },
      true,
      1000,
      9000,
    ],
    [
      'tx amount melebihi afterItem diblokir',
      [{ sellPrice: 10000, qty: 1, itemDiscount: { kind: 'amount', value: 2000 } }],
      { kind: 'amount', value: 9000 },
      false,
      2000,
      8000,
    ],
    [
      'tx percent >100 diblokir',
      [{ sellPrice: 10000, qty: 1, itemDiscount: null }],
      { kind: 'percent', value: 101 },
      false,
      0,
      10000,
    ],
    [
      'tx amount == afterItem diperbolehkan (total 0)',
      [{ sellPrice: 5000, qty: 1, itemDiscount: null }],
      { kind: 'amount', value: 5000 },
      true,
      5000,
      0,
    ],
  ] as const)(
    '%s',
    (_label, itemsSetup, txDiscount, shouldSucceed, expectedTxAmount, expectedTotal) => {
      itemsSetup.forEach((setup, idx) => {
        const p = makeProduct({ id: `p${idx}`, sellPrice: setup.sellPrice });
        useCartStore.getState().addItem(p, setup.qty);
        if (setup.itemDiscount) {
          useCartStore
            .getState()
            .setItemDiscount(`p${idx}`, setup.itemDiscount as DiscountValue);
        }
      });
      const result = useCartStore
        .getState()
        .setTransactionDiscount(txDiscount as DiscountValue);
      expect(result).toBe(shouldSucceed);
      const totals = useCartStore.getState().getTotals();
      if (shouldSucceed) {
        expect(totals.transactionDiscountAmount).toBe(expectedTxAmount);
        expect(totals.total).toBe(expectedTotal);
      } else {
        expect(useCartStore.getState().transactionDiscount).toBeNull();
      }
      resetStore();
    },
  );

  it('stacking benar: item discount + tx discount dijumlahkan, tidak nested ganda', () => {
    const p1 = makeProduct({ id: 'p1', sellPrice: 10000 });
    const p2 = makeProduct({ id: 'p2', name: 'Teh Pucuk 350ml', sellPrice: 5000 });
    useCartStore.getState().addItem(p1, 2);
    useCartStore.getState().addItem(p2, 1);
    useCartStore.getState().setItemDiscount('p1', { kind: 'percent', value: 10 });
    useCartStore.getState().setTransactionDiscount({ kind: 'percent', value: 10 });
    const totals = useCartStore.getState().getTotals();
    expect(totals.subtotal).toBe(25000);
    expect(totals.itemDiscountTotal).toBe(2000);
    expect(totals.transactionDiscountAmount).toBe(2300);
    expect(totals.totalDiscount).toBe(4300);
    expect(totals.total).toBe(20700);
  });

  it('diskon transaksi diblokir saat keranjang kosong', () => {
    expect(useCartStore.getState().isEmpty()).toBe(true);
    expect(
      useCartStore.getState().setTransactionDiscount({ kind: 'amount', value: 1000 }),
    ).toBe(false);
    expect(
      useCartStore.getState().setTransactionDiscount({ kind: 'percent', value: 10 }),
    ).toBe(false);
    expect(useCartStore.getState().transactionDiscount).toBeNull();
    expect(useCartStore.getState().getTotals().total).toBe(0);
  });

  it('mengosongkan keranjang mereset total ke 0', () => {
    const p = makeProduct({ id: 'p1', sellPrice: 10000 });
    useCartStore.getState().addItem(p, 1);
    useCartStore.getState().setTransactionDiscount({ kind: 'amount', value: 1000 });
    expect(useCartStore.getState().getTotals().total).toBe(9000);
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().getTotals()).toEqual({
      subtotal: 0,
      itemDiscountTotal: 0,
      transactionDiscountAmount: 0,
      totalDiscount: 0,
      total: 0,
    });
  });
});

describe('cartStore - edge cart kosong dan validasi tambahan', () => {
  beforeEach(resetStore);

  it('getTotals pada keranjang kosong menghasilkan 0 semua', () => {
    const totals = useCartStore.getState().getTotals();
    expect(totals).toEqual({
      subtotal: 0,
      itemDiscountTotal: 0,
      transactionDiscountAmount: 0,
      totalDiscount: 0,
      total: 0,
    });
    expect(useCartStore.getState().getSubtotal()).toBe(0);
    expect(useCartStore.getState().getItemDiscountTotal()).toBe(0);
    expect(useCartStore.getState().getTransactionDiscountAmount()).toBe(0);
    expect(useCartStore.getState().getTotalDiscount()).toBe(0);
    expect(useCartStore.getState().getTotal()).toBe(0);
  });

  it('setItemDiscount diblokir pada produk tidak ada', () => {
    expect(
      useCartStore.getState().setItemDiscount('tidak-ada', { kind: 'amount', value: 1000 }),
    ).toBe(false);
  });

  it('diskon item amount 0 diperbolehkan', () => {
    const p = makeProduct({ id: 'p1', sellPrice: 10000 });
    useCartStore.getState().addItem(p, 1);
    expect(
      useCartStore.getState().setItemDiscount('p1', { kind: 'amount', value: 0 }),
    ).toBe(true);
    expect(useCartStore.getState().getTotals().itemDiscountTotal).toBe(0);
  });
});
