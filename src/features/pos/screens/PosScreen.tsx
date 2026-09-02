import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { database } from '../../../database';
import type Category from '../../../database/models/category';
import type Product from '../../../database/models/product';
import type Customer from '../../../database/models/customer';
import { CheckoutService } from '../../../services/CheckoutService';
import { CustomerService } from '../../../services/CustomerService';
import { ProductService, matchesProductName } from '../../../services/ProductService';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';
import { useSessionStore } from '../../auth/sessionStore';
import type { PosStackParamList } from '../../../app/navigation';
import {
  calculateCartTotals,
  calculateItemDiscountAmount,
  useCartStore,
} from '../cartStore';
import { normalizeBarcode } from '../../../hardware/scanner/barcode';
import { BarcodeScannerStubSheet } from '../../products/components/BarcodeScannerStubSheet';
import { CartPanel } from '../components/CartPanel';
import { PaymentSheet, PaymentSheetResult } from '../components/PaymentSheet';

// T3.1 (ShiftService) akan menyediakan id shift aktif; sampai gate BukaShift
// (T3.2) ada, checkout memakai placeholder yang sama dengan skema uji T1.8.
const SHIFT_PLACEHOLDER_ID = 'shift-1';

const customerService = new CustomerService(database);

type CategoryTabProps = {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

const CategoryTabs = React.memo(({ categories, selectedId, onSelect }: CategoryTabProps) => {
  const { t } = useTranslation();

  const handleAllPress = React.useCallback(() => {
    onSelect(null);
  }, [onSelect]);

  const handleCategoryPress = React.useCallback(
    (categoryId: string) => {
      onSelect(categoryId);
    },
    [onSelect],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabsContent}
      style={styles.tabsContainer}>
      <CategoryChip
        active={selectedId === null}
        label={t('pos.categoryAll')}
        onPress={handleAllPress}
      />
      {categories.map((category) => (
        <CategoryChipWrapper
          key={category.id}
          category={category}
          selectedId={selectedId}
          onSelect={handleCategoryPress}
        />
      ))}
    </ScrollView>
  );
});
CategoryTabs.displayName = 'CategoryTabs';

type CategoryChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

const CategoryChip = React.memo(({ label, active, onPress }: CategoryChipProps) => (
  <TouchableOpacity
    accessibilityRole="button"
    onPress={onPress}
    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}>
    <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
      {label}
    </Text>
  </TouchableOpacity>
));
CategoryChip.displayName = 'CategoryChip';

type CategoryChipWrapperProps = {
  category: Category;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const CategoryChipWrapper = React.memo(({ category, selectedId, onSelect }: CategoryChipWrapperProps) => {
  const handlePress = React.useCallback(() => {
    onSelect(category.id);
  }, [category.id, onSelect]);

  return (
    <CategoryChip
      active={selectedId === category.id}
      label={category.name}
      onPress={handlePress}
    />
  );
});
CategoryChipWrapper.displayName = 'CategoryChipWrapper';

// Tile ≥88dp (AGENTS.md §6.3): minHeight 96 + padding; performa murah —
// React.memo + useCallback di induk agar FlashList tidak buat closure per-item.
type TileProps = {
  product: Product;
  onPress: (product: Product) => void;
};

const ProductTile = React.memo(({ product, onPress }: TileProps) => {
  const lowStock = product.stock <= product.minStock;
  const outOfStock = product.stock <= 0;
  const unitLabel =
    product.unit === 'custom' && product.customUnitLabel ? product.customUnitLabel : product.unit;

  const handlePress = React.useCallback(() => {
    onPress(product);
  }, [onPress, product]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={[styles.tile, outOfStock && styles.tileOutOfStock]}>
      <View style={styles.tileTop}>
        <Text numberOfLines={2} style={styles.tileName}>
          {product.name}
        </Text>
        {lowStock ? (
          <View style={styles.lowStockBadge}>
            <Text style={styles.lowStockBadgeText}>!</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.tileUnit}>
        {unitLabel}
      </Text>
      <Text numberOfLines={1} style={styles.tilePrice}>
        {formatRupiah(product.sellPrice)}
      </Text>
      <Text style={[styles.tileStock, lowStock && styles.tileStockLow]}>
        {product.stock <= 0 ? 'Habis' : `Stok ${product.stock}`}
      </Text>
    </TouchableOpacity>
  );
});
ProductTile.displayName = 'ProductTile';

type EmptyProps = {
  query: string;
  hasProducts: boolean;
  onAddProduct: () => void;
  onClearSearch: () => void;
};

const PosEmptyState = React.memo(({ query, hasProducts, onAddProduct, onClearSearch }: EmptyProps) => {
  const { t } = useTranslation();
  const trimmed = query.trim();
  const isSearchEmpty = trimmed !== '' && hasProducts;

  if (isSearchEmpty) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('pos.searchEmpty', { query: trimmed })}</Text>
        <TouchableOpacity onPress={onClearSearch} style={styles.emptyGhostButton}>
          <Text style={styles.emptyGhostButtonText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{t('pos.emptyTitle')}</Text>
      <Text style={styles.emptyHint}>{t('pos.emptyHint')}</Text>
      <TouchableOpacity onPress={onAddProduct} style={styles.emptyCta}>
        <Text style={styles.emptyCtaText}>{t('pos.emptyCta')}</Text>
      </TouchableOpacity>
    </View>
  );
});
PosEmptyState.displayName = 'PosEmptyState';

export const PosScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<PosStackParamList>>();

  const productService = React.useMemo(() => new ProductService(database), []);
  const checkoutService = React.useMemo(() => new CheckoutService(database), []);

  const [products, setProducts] = React.useState<Product[] | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [query, setQuery] = React.useState('');
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [scanVisible, setScanVisible] = React.useState(false);
  const [paymentVisible, setPaymentVisible] = React.useState(false);

  const addItem = useCartStore((state) => state.addItem);
  const cartItems = useCartStore((state) => state.items);
  const transactionDiscount = useCartStore((state) => state.transactionDiscount);

  const cartTotal = React.useMemo(
    () => calculateCartTotals(cartItems, transactionDiscount).total,
    [cartItems, transactionDiscount],
  );

  const load = React.useCallback(async () => {
    const [allProducts, allCategories, allCustomers] = await Promise.all([
      productService.listProducts(),
      productService.listCategories(),
      customerService.listCustomers(),
    ]);
    setProducts(allProducts);
    setCategories(allCategories);
    setCustomers(allCustomers);
  }, [productService]);

  React.useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  const displayedProducts = React.useMemo(() => {
    if (products === null) {
      return [];
    }
    const active = products.filter((product) => product.isActive);
    const byCategory =
      selectedCategoryId === null
        ? active
        : active.filter((product) => product.categoryId === selectedCategoryId);

    const trimmed = query.trim();
    if (trimmed === '') {
      return byCategory;
    }

    const barcodeMatch = byCategory.find((product) => product.barcode === trimmed);
    const nameMatches = byCategory.filter((product) => matchesProductName(product.name, trimmed));

    if (barcodeMatch) {
      const withoutDuplicate = nameMatches.filter((product) => product.id !== barcodeMatch.id);
      return [barcodeMatch, ...withoutDuplicate];
    }
    return nameMatches;
  }, [products, selectedCategoryId, query]);

  const hasAnyProduct = React.useMemo(
    () => (products ?? []).some((product) => product.isActive),
    [products],
  );

  const handleSelectCategory = React.useCallback((id: string | null) => {
    setSelectedCategoryId(id);
  }, []);

  const handleProductPress = React.useCallback(
    (product: Product) => {
      addItem(
        {
          id: product.id,
          name: product.name,
          unit: product.unit,
          customUnitLabel: product.customUnitLabel,
          sellPrice: product.sellPrice,
        },
        1,
      );
    },
    [addItem],
  );

  const handleClearSearch = React.useCallback(() => {
    setQuery('');
  }, []);

  const handleAddProduct = React.useCallback(() => {
    const parent = navigation.getParent();
    if (parent) {
      (parent as unknown as { navigate: (name: string, params?: unknown) => void }).navigate(
        'ProductsTab',
        { screen: 'ProductForm' } as unknown as undefined,
      );
    } else {
      (navigation as unknown as { navigate: (name: string) => void }).navigate('ProductForm' as never);
    }
  }, [navigation]);

  const handleScanSubmit = React.useCallback(
    (rawBarcode: string) => {
      const barcode = normalizeBarcode(rawBarcode);
      setScanVisible(false);
      if (!barcode) {
        return;
      }
      const currentProducts = products ?? [];
      const match = currentProducts.find((p) => p.barcode === barcode && p.isActive);
      if (match) {
        addItem(
          {
            id: match.id,
            name: match.name,
            unit: match.unit,
            customUnitLabel: match.customUnitLabel,
            sellPrice: match.sellPrice,
          },
          1,
        );
        setQuery('');
        return;
      }
      setQuery(barcode);
    },
    [addItem, products],
  );

  const handleScanCancel = React.useCallback(() => {
    setScanVisible(false);
  }, []);

  const handleOpenScan = React.useCallback(() => {
    setScanVisible(true);
  }, []);

  const handleSearchSubmit = React.useCallback(() => {
    const barcode = normalizeBarcode(query);
    if (!barcode) {
      return;
    }
    const currentProducts = products ?? [];
    const match = currentProducts.find((p) => p.barcode === barcode && p.isActive);
    if (match) {
      addItem(
        {
          id: match.id,
          name: match.name,
          unit: match.unit,
          customUnitLabel: match.customUnitLabel,
          sellPrice: match.sellPrice,
        },
        1,
      );
      setQuery('');
    }
  }, [addItem, products, query]);

  const handlePayPress = React.useCallback(() => {
    setPaymentVisible(true);
  }, []);

  const handleClosePayment = React.useCallback(() => {
    setPaymentVisible(false);
  }, []);

  const handleCreateCustomer = React.useCallback(
    async (name: string, phone?: string | null, note?: string | null, debtLimit?: number | null): Promise<Customer> => {
      return customerService.createCustomer({ name, phone, note, debtLimit });
    },
    [],
  );

  const handlePaymentConfirm = React.useCallback(
    async (result: PaymentSheetResult): Promise<boolean> => {
      const currentUserId = useSessionStore.getState().currentUserId;
      if (currentUserId === null) {
        return false;
      }

      const cart = useCartStore.getState();
      const totals = calculateCartTotals(cart.items, cart.transactionDiscount);
      const items = cart.items.map((item) => ({
        productId: item.productId,
        qty: item.qty,
        unitPrice: item.unitPrice,
        discount: calculateItemDiscountAmount(item),
      }));

      let payments: { method: 'cash' | 'qris' | 'debit' | 'transfer'; amount: number; reference?: string | null }[] = [];
      let status: 'paid' | 'debt' = 'paid';
      let customerId: string | null = null;

      if (result.type === 'cash') {
        payments = [{ method: 'cash', amount: result.received }];
      } else if (result.type === 'split') {
        payments = result.payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference ?? null,
        }));
      } else if (result.type === 'bon') {
        status = 'debt';
        customerId = result.customer.id;
        payments = result.payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference ?? null,
        }));
      }

      const checkoutResult = await checkoutService.checkout({
        shiftId: SHIFT_PLACEHOLDER_ID,
        userId: currentUserId,
        customerId,
        items,
        transactionDiscount: totals.transactionDiscountAmount,
        tax: 0,
        payments,
        status,
      });

      if (checkoutResult.status === 'ok') {
        const change =
          result.type === 'cash' ? Math.max(0, result.received - totals.total) : 0;
        useCartStore.getState().clearCart();
        setPaymentVisible(false);
        navigation.navigate('PaymentSuccess', {
          transactionId: checkoutResult.transaction.id,
          invoiceNo: checkoutResult.invoiceNo,
          change,
          total: totals.total,
        });
        return true;
      }
      return false;
    },
    [checkoutService, navigation],
  );

  const handleQueryChange = React.useCallback((value: string) => {
    setQuery(value);
  }, []);

  const renderItem = React.useCallback(
    ({ item }: { item: Product }) => <ProductTile product={item} onPress={handleProductPress} />,
    [handleProductPress],
  );

  const keyExtractor = React.useCallback((item: Product) => item.id, []);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          autoFocus={false}
          onChangeText={handleQueryChange}
          onSubmitEditing={handleSearchSubmit}
          placeholder={t('pos.searchPlaceholder')}
          placeholderTextColor={colors.white[150]}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
        <TouchableOpacity onPress={handleOpenScan} style={styles.scanButton}>
          <Text style={styles.scanButtonText}>{t('pos.scan')}</Text>
        </TouchableOpacity>
      </View>

      <CategoryTabs
        categories={categories}
        selectedId={selectedCategoryId}
        onSelect={handleSelectCategory}
      />

      <View style={styles.content}>
        <View style={styles.gridWrap}>
          <FlashList
            data={displayedProducts}
            keyExtractor={keyExtractor}
            numColumns={2}
            renderItem={renderItem}
            contentContainerStyle={styles.gridContent}
            ListEmptyComponent={
              products === null ? null : (
                <PosEmptyState
                  query={query}
                  hasProducts={hasAnyProduct}
                  onAddProduct={handleAddProduct}
                  onClearSearch={handleClearSearch}
                />
              )
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
        <CartPanel onPay={handlePayPress} />
      </View>

      <BarcodeScannerStubSheet
        visible={scanVisible}
        onCancel={handleScanCancel}
        onSubmit={handleScanSubmit}
      />

      <PaymentSheet
        total={cartTotal}
        visible={paymentVisible}
        onClose={handleClosePayment}
        onConfirm={handlePaymentConfirm}
        customers={customers}
        onCreateCustomer={handleCreateCustomer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchInput: {
    ...typography.body,
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.white[50],
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  scanButton: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  scanButtonText: {
    ...typography.body,
    color: colors.white[300],
  },
  tabsContainer: {
    flexGrow: 0,
    maxHeight: 56,
  },
  tabsContent: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    minHeight: 32,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  chipInactive: {
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
  },
  chipText: {
    ...typography.caption,
  },
  chipTextActive: {
    color: colors.black[900],
    fontWeight: '600',
  },
  chipTextInactive: {
    color: colors.white[300],
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  gridWrap: {
    flex: 0.65,
    minHeight: 200,
  },
  gridContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl * 2,
  },
  tile: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    flex: 1,
    margin: spacing.sm / 2,
    minHeight: 96,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  tileOutOfStock: {
    opacity: 0.5,
  },
  tileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  tileName: {
    ...typography.body,
    color: colors.white[50],
    flex: 1,
  },
  lowStockBadge: {
    backgroundColor: colors.yellow[400],
    borderRadius: radius.pill,
    height: 18,
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lowStockBadgeText: {
    ...typography.micro,
    color: colors.black[900],
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 11,
  },
  tileUnit: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
  },
  tilePrice: {
    ...typography.heading,
    color: colors.white[50],
    fontSize: 15,
    marginTop: spacing.xs,
  },
  tileStock: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.xs,
  },
  tileStockLow: {
    color: colors.yellow[400],
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.white[50],
    textAlign: 'center',
  },
  emptyHint: {
    ...typography.body,
    color: colors.white[300],
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  emptyCta: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  emptyCtaText: {
    ...typography.heading,
    color: colors.black[900],
  },
  emptyGhostButton: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  emptyGhostButtonText: {
    ...typography.heading,
    color: colors.white[300],
  },
});
