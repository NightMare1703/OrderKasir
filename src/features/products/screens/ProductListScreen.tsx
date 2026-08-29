import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as React from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import Product from '../../../database/models/product';
import { ProductService } from '../../../services/ProductService';
import { colors, radius, spacing, typography } from '../../../theme';
import type { ProductsStackParamList } from '../../../app/navigation';
import { formatRupiah } from '../../../utils/money';
import { BarcodeScannerStubSheet } from '../components/BarcodeScannerStubSheet';

type ProductListScreenProps = NativeStackScreenProps<ProductsStackParamList, 'ProductList'>;

type EmptyStateProps = {
  messageKey: string;
  query: string;
  showCta: boolean;
  onCtaPress: () => void;
};

const ListEmptyState = ({ messageKey, query, showCta, onCtaPress }: EmptyStateProps) => {
  const { t } = useTranslation();

  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{t(messageKey, { query })}</Text>
      {showCta ? (
        <>
          <Text style={styles.emptyHint}>{t('products.emptyHint')}</Text>
          <TouchableOpacity onPress={onCtaPress} style={styles.emptyCta}>
            <Text style={styles.emptyCtaText}>{t('products.emptyCta')}</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
};

type RowProps = {
  item: Product;
  onPress: () => void;
};

// Stok tampil sebagai angka polos tanpa "Rp" (GLOSSARY §3); merah bila ≤ stok
// minimum + teks "Nonaktif" agar status tidak bergantung warna saja.
const ProductRow = ({ item, onPress }: RowProps) => {
  const { t } = useTranslation();
  const lowStock = item.stock <= item.minStock;

  return (
    <TouchableOpacity onPress={onPress} style={[styles.row, !item.isActive && styles.rowInactive]}>
      <View style={styles.rowInfo}>
        <Text numberOfLines={1} style={styles.rowName}>
          {item.name}
        </Text>
        <Text style={styles.rowPrice}>{formatRupiah(item.sellPrice)}</Text>
      </View>
      <View style={styles.rowMeta}>
        {!item.isActive ? (
          <Text style={styles.rowInactiveLabel}>{t('products.inactive')}</Text>
        ) : null}
        <Text style={[styles.rowStock, lowStock && styles.rowStockLow]}>{item.stock}</Text>
      </View>
    </TouchableOpacity>
  );
};

export const ProductListScreen = ({ navigation }: ProductListScreenProps) => {
  const { t } = useTranslation();

  const productService = React.useMemo(() => new ProductService(database), []);

  const [products, setProducts] = React.useState<Product[] | null>(null);
  const [query, setQuery] = React.useState('');
  const [scanVisible, setScanVisible] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const rows =
        query.trim() === ''
          ? await productService.listProducts()
          : await productService.searchProducts(query);
      if (!cancelled) {
        setProducts(rows);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [productService, query]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Muat ulang saat kembali dari form (produk bisa bertambah/berubah).
      productService
        .listProducts()
        .then((rows) => {
          if (query.trim() === '') {
            setProducts(rows);
          }
        })
        .catch(() => {});
    });
    return unsubscribe;
  }, [navigation, productService, query]);

  const openForm = React.useCallback(
    (productId?: string) => {
      navigation.navigate('ProductForm', productId ? { productId } : undefined);
    },
    [navigation],
  );

  const renderRow = React.useCallback(
    ({ item }: { item: Product }) => <ProductRow item={item} onPress={() => openForm(item.id)} />,
    [openForm],
  );

  const isEmptyWithoutQuery = products !== null && products.length === 0 && query.trim() === '';

  const lowCount = React.useMemo(() => {
    if (products === null) return 0;
    return products.filter((p) => p.stock <= p.minStock).length;
  }, [products]);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          onChangeText={setQuery}
          placeholder={t('products.searchPlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={styles.searchInput}
          value={query}
        />
        <TouchableOpacity onPress={() => setScanVisible(true)} style={styles.scanButton}>
          <Text style={styles.scanButtonText}>{t('products.scan')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inventoryBar}>
        <TouchableOpacity
          onPress={() => navigation.navigate('InventoryList')}
          style={styles.inventoryButton}>
          <Text style={styles.inventoryButtonText}>{t('inventory.title')}</Text>
          {lowCount > 0 ? (
            <View style={styles.yellowBadge}>
              <Text style={styles.yellowBadgeText}>{lowCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('StockLog', {})}
          style={styles.logButton}>
          <Text style={styles.logButtonText}>{t('inventory.logTitle')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={products ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        ListEmptyComponent={
          products !== null && products.length === 0 ? (
            <ListEmptyState
              messageKey={isEmptyWithoutQuery ? 'products.emptyTitle' : 'products.searchEmpty'}
              query={query.trim()}
              showCta={isEmptyWithoutQuery}
              onCtaPress={() => openForm()}
            />
          ) : undefined
        }
      />

      {!isEmptyWithoutQuery ? (
        <TouchableOpacity
          accessibilityLabel={t('products.formCreateTitle')}
          onPress={() => openForm()}
          style={styles.fab}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      ) : null}

      <BarcodeScannerStubSheet
        visible={scanVisible}
        onCancel={() => setScanVisible(false)}
        onSubmit={(barcode) => {
          setScanVisible(false);
          setQuery(barcode);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
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
  emptyHint: {
    ...typography.body,
    color: colors.white[300],
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.white[50],
    textAlign: 'center',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.pill,
    bottom: spacing.xl,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xl,
    width: 56,
  },
  fabText: {
    ...typography.title,
    color: colors.black[900],
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  row: {
    backgroundColor: colors.black[800],
    borderRadius: radius.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowInactive: {
    opacity: 0.5,
  },
  rowInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  rowMeta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  rowName: {
    ...typography.body,
    color: colors.white[50],
  },
  rowPrice: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.xs,
  },
  rowStock: {
    ...typography.body,
    color: colors.white[50],
  },
  rowStockLow: {
    color: colors.red[500],
  },
  rowInactiveLabel: {
    ...typography.micro,
    color: colors.white[150],
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  inventoryBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  inventoryButton: {
    alignItems: 'center',
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  inventoryButtonText: {
    ...typography.caption,
    color: colors.white[300],
    fontWeight: '600',
  },
  yellowBadge: {
    backgroundColor: colors.yellow[400],
    borderRadius: radius.pill,
    height: 18,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  yellowBadgeText: {
    ...typography.micro,
    color: colors.black[900],
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 11,
  },
  logButton: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  logButtonText: {
    ...typography.caption,
    color: colors.white[300],
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
  searchRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    padding: spacing.lg,
  },
});
