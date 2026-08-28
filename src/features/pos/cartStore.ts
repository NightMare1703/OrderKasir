import { create } from 'zustand';

export type DiscountKind = 'amount' | 'percent';

export type DiscountValue = {
  kind: DiscountKind;
  value: number;
};

export type CartProduct = {
  id: string;
  name: string;
  unit: string;
  customUnitLabel?: string | null;
  sellPrice: number;
};

export type CartItem = {
  productId: string;
  name: string;
  unit: string;
  customUnitLabel: string | null;
  unitPrice: number;
  qty: number;
  note: string | null;
  discount: DiscountValue | null;
};

export type CartTotals = {
  subtotal: number;
  itemDiscountTotal: number;
  transactionDiscountAmount: number;
  totalDiscount: number;
  total: number;
};

const isValidDiscountShape = (discount: DiscountValue | null): boolean => {
  if (discount === null) return true;
  if (discount.kind !== 'amount' && discount.kind !== 'percent') return false;
  if (!Number.isInteger(discount.value) || discount.value < 0) return false;
  if (discount.kind === 'percent' && discount.value > 100) return false;
  return true;
};

export const calculateItemSubtotal = (item: Pick<CartItem, 'qty' | 'unitPrice'>): number =>
  item.qty * item.unitPrice;

export const calculateItemDiscountAmount = (item: CartItem): number => {
  if (!item.discount) return 0;
  const subtotal = calculateItemSubtotal(item);
  if (item.discount.kind === 'amount') {
    return item.discount.value > subtotal ? subtotal : item.discount.value;
  }
  return Math.floor((subtotal * item.discount.value) / 100);
};

export const calculateTransactionDiscountAmount = (
  subtotalAfterItemDiscount: number,
  discount: DiscountValue | null,
): number => {
  if (!discount) return 0;
  if (discount.kind === 'amount') {
    return discount.value > subtotalAfterItemDiscount
      ? subtotalAfterItemDiscount
      : discount.value;
  }
  return Math.floor((subtotalAfterItemDiscount * discount.value) / 100);
};

export const calculateCartTotals = (
  items: CartItem[],
  transactionDiscount: DiscountValue | null,
): CartTotals => {
  const subtotal = items.reduce((sum, item) => sum + calculateItemSubtotal(item), 0);
  const itemDiscountTotal = items.reduce(
    (sum, item) => sum + calculateItemDiscountAmount(item),
    0,
  );
  const afterItem = subtotal - itemDiscountTotal;
  const transactionDiscountAmount = calculateTransactionDiscountAmount(
    afterItem,
    transactionDiscount,
  );
  const totalDiscount = itemDiscountTotal + transactionDiscountAmount;
  const total = Math.max(0, subtotal - totalDiscount);
  return {
    subtotal,
    itemDiscountTotal,
    transactionDiscountAmount,
    totalDiscount,
    total,
  };
};

const isValidQty = (qty: number): boolean => Number.isInteger(qty) && qty > 0;

const isValidProduct = (product: CartProduct): boolean => {
  if (!product.id || typeof product.id !== 'string' || product.id.trim() === '') return false;
  if (!product.name || product.name.trim() === '') return false;
  if (!product.unit || product.unit.trim() === '') return false;
  if (!Number.isInteger(product.sellPrice) || product.sellPrice < 0) return false;
  return true;
};

const normalizeNote = (note: string | null): string | null => {
  if (note === null) return null;
  const trimmed = note.trim();
  if (trimmed === '') return null;
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
};

type CartState = {
  items: CartItem[];
  transactionDiscount: DiscountValue | null;
  addItem: (product: CartProduct, qty?: number) => void;
  updateQty: (productId: string, qty: number) => boolean;
  removeItem: (productId: string) => void;
  setItemNote: (productId: string, note: string | null) => void;
  setItemDiscount: (productId: string, discount: DiscountValue | null) => boolean;
  setTransactionDiscount: (discount: DiscountValue | null) => boolean;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemDiscountTotal: () => number;
  getTransactionDiscountAmount: () => number;
  getTotalDiscount: () => number;
  getTotal: () => number;
  getTotals: () => CartTotals;
  getItemCount: () => number;
  isEmpty: () => boolean;
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  transactionDiscount: null,

  addItem: (product, qty = 1) =>
    set((state) => {
      if (!isValidProduct(product) || !isValidQty(qty)) return state;
      const idx = state.items.findIndex((item) => item.productId === product.id);
      if (idx >= 0) {
        const existing = state.items[idx];
        const nextQty = existing.qty + qty;
        if (!isValidQty(nextQty)) return state;
        const nextItems = [...state.items];
        nextItems[idx] = { ...existing, qty: nextQty };
        return { items: nextItems };
      }
      const newItem: CartItem = {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        customUnitLabel: product.customUnitLabel ?? null,
        unitPrice: product.sellPrice,
        qty,
        note: null,
        discount: null,
      };
      return { items: [...state.items, newItem] };
    }),

  updateQty: (productId, qty) => {
    if (!isValidQty(qty)) return false;
    const { items } = get();
    const idx = items.findIndex((item) => item.productId === productId);
    if (idx < 0) return false;
    const existing = items[idx];
    if (existing.discount?.kind === 'amount' && existing.discount.value > qty * existing.unitPrice) {
      return false;
    }
    set((state) => {
      const nextItems = [...state.items];
      nextItems[idx] = { ...nextItems[idx], qty };
      return { items: nextItems };
    });
    const { items: afterItems, transactionDiscount } = get();
    if (transactionDiscount?.kind === 'amount') {
      const totals = calculateCartTotals(afterItems, null);
      const afterItem = totals.subtotal - totals.itemDiscountTotal;
      if (transactionDiscount.value > afterItem) {
        set({ transactionDiscount: null });
      }
    }
    return true;
  },

  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((item) => item.productId !== productId),
    })),

  setItemNote: (productId, note) =>
    set((state) => {
      const idx = state.items.findIndex((item) => item.productId === productId);
      if (idx < 0) return state;
      const nextItems = [...state.items];
      nextItems[idx] = { ...nextItems[idx], note: normalizeNote(note) };
      return { items: nextItems };
    }),

  setItemDiscount: (productId, discount) => {
    if (!isValidDiscountShape(discount)) return false;
    const { items } = get();
    const idx = items.findIndex((item) => item.productId === productId);
    if (idx < 0) return false;
    const item = items[idx];
    const subtotal = calculateItemSubtotal(item);
    if (discount !== null) {
      if (discount.kind === 'amount' && discount.value > subtotal) return false;
      const amount =
        discount.kind === 'amount'
          ? discount.value
          : Math.floor((subtotal * discount.value) / 100);
      if (amount > subtotal) return false;
    }
    set((state) => {
      const nextItems = [...state.items];
      nextItems[idx] = { ...nextItems[idx], discount };
      return { items: nextItems };
    });
    const { items: afterItems, transactionDiscount } = get();
    if (transactionDiscount?.kind === 'amount') {
      const totals = calculateCartTotals(afterItems, null);
      const afterItem = totals.subtotal - totals.itemDiscountTotal;
      if (transactionDiscount.value > afterItem) {
        set({ transactionDiscount: null });
      }
    }
    return true;
  },

  setTransactionDiscount: (discount) => {
    if (!isValidDiscountShape(discount)) return false;
    const { items } = get();
    const totalsWithoutTx = calculateCartTotals(items, null);
    const afterItem = totalsWithoutTx.subtotal - totalsWithoutTx.itemDiscountTotal;
    if (discount !== null) {
      if (afterItem === 0 && discount.value > 0) return false;
      const amount =
        discount.kind === 'amount'
          ? discount.value
          : Math.floor((afterItem * discount.value) / 100);
      if (amount > afterItem) return false;
      if (discount.kind === 'amount' && discount.value > afterItem) return false;
    }
    set({ transactionDiscount: discount });
    return true;
  },

  clearCart: () => set({ items: [], transactionDiscount: null }),

  getSubtotal: () => calculateCartTotals(get().items, null).subtotal,

  getItemDiscountTotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + calculateItemDiscountAmount(item), 0);
  },

  getTransactionDiscountAmount: () => {
    const { items, transactionDiscount } = get();
    const totalsWithoutTx = calculateCartTotals(items, null);
    const afterItem = totalsWithoutTx.subtotal - totalsWithoutTx.itemDiscountTotal;
    return calculateTransactionDiscountAmount(afterItem, transactionDiscount);
  },

  getTotalDiscount: () => {
    const { getItemDiscountTotal, getTransactionDiscountAmount } = get();
    return getItemDiscountTotal() + getTransactionDiscountAmount();
  },

  getTotal: () => calculateCartTotals(get().items, get().transactionDiscount).total,

  getTotals: () => calculateCartTotals(get().items, get().transactionDiscount),

  getItemCount: () => get().items.reduce((sum, item) => sum + item.qty, 0),

  isEmpty: () => get().items.length === 0,
}));
