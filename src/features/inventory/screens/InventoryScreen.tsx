import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import type Product from '../../../database/models/product';
import { ProductService } from '../../../services/ProductService';
import { colors, radius, spacing, typography } from '../../../theme';
import type { ProductsStackParamList } from '../../../app/navigation';

type Props = NativeStackScreenProps<ProductsStackParamList, 'InventoryList'>;

type Filter = 'all' | 'low';

type RowProps = {
  product: Product;
  onAdjust: () => void;
  onLog: () => void;
};

const InventoryRow = ({ product, onAdjust, onLog }: RowProps) => {
  const { t } = useTranslation();
  const isLow = product.stock <= product.minStock;
  const isOut = product.stock <= 0;
  const unitLabel =
    product.unit === 'custom' && product.customUnitLabel
      ? product.customUnitLabel
      : product.unit;

  return (
    <View style={[styles.row, !product.isActive && styles.rowInactive]}>
      <View style={styles.rowInfo}>
        <View style={styles.rowNameWrap}>
          <Text numberOfLines={1} style={styles.rowName}>
            {product.name}
          </Text>
          {isLow ? (
            <View style={styles.lowPill}>
              <Text style={styles.lowPillText}>
                {isOut ? t('inventory.outOfStockLabel') : t('inventory.lowStockLabel')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowMeta}>
          {t('inventory.stockLabel')} {product.stock} {unitLabel} · {t('inventory.minStockLabel')} {product.minStock}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <TouchableOpacity onPress={onAdjust} style={styles.actionAdjust}>
          <Text style={styles.actionAdjustText}>{t('inventory.adjust')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onLog} style={styles.actionLog}>
          <Text style={styles.actionLogText}>{t('inventory.viewLog')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const InventoryScreen = ({ navigation }: Props) => {
  const { t } = useTranslation();

  const productService = React.useMemo(() => new ProductService(database), []);

  const [products, setProducts] = React.useState<Product[] | null>(null);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('all');

  const load = React.useCallback(async () => {
    const rows =
      query.trim() === ''
        ? await productService.listProducts()
        : await productService.searchProducts(query);
    setProducts(rows);
  }, [productService, query]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      load();
    });
    return unsub;
  }, [navigation, load]);

  React.useEffect(() => {
    navigation.setOptions({ headerTitle: t('inventory.title') });
  }, [navigation, t]);

  const lowCount = React.useMemo(() => {
    if (products === null) return 0;
    return products.filter((p) => p.stock <= p.minStock).length;
  }, [products]);

  const displayed = React.useMemo(() => {
    if (products === null) return [];
    const afterFilter =
      filter === 'low' ? products.filter((p) => p.stock <= p.minStock) : products;
    return afterFilter;
  }, [products, filter]);

  const handleAdjust = React.useCallback(
    (productId: string) => {
      navigation.navigate('StockAdjustment', { productId });
    },
    [navigation],
  );

  const handleLog = React.useCallback(
    (productId: string) => {
      navigation.navigate('StockLog', { productId });
    },
    [navigation],
  );

  const handleLogAll = React.useCallback(() => {
    navigation.navigate('StockLog', {});
  }, [navigation]);

  const renderItem = React.useCallback(
    ({ item }: { item: Product }) => (
      <InventoryRow
        product={item}
        onAdjust={() => handleAdjust(item.id)}
        onLog={() => handleLog(item.id)}
      />
    ),
    [handleAdjust, handleLog],
  );

  const keyExtractor = React.useCallback((item: Product) => item.id, []);

  const emptyComponent = React.useMemo(() => {
    if (products === null) return null;
    if (displayed.length > 0) return null;

    if (products.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>{t('inventory.emptyTitle')}</Text>
          <Text style={styles.emptyHint}>{t('inventory.emptyHint')}</Text>
        </View>
      );
    }
    if (filter === 'low') {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>{t('inventory.emptyLowTitle')}</Text>
          <Text style={styles.emptyHint}>{t('inventory.emptyLowHint')}</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('inventory.emptySearchTitle', { query: query.trim() })}</Text>
      </View>
    );
  }, [displayed.length, filter, products, query, t]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.searchWrap}>
          <TextInput
            onChangeText={setQuery}
            placeholder={t('inventory.listSearchPlaceholder')}
            placeholderTextColor={colors.white[150]}
            style={styles.searchInput}
            value={query}
          />
        </View>
        <TouchableOpacity onPress={handleLogAll} style={styles.headerLogButton}>
          <Text style={styles.headerLogButtonText}>{t('inventory.logTitle')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          onPress={() => setFilter('all')}
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}>
          <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>
            {t('inventory.filterAll')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFilter('low')}
          style={[styles.filterChip, filter === 'low' && styles.filterChipActiveLow]}>
          <Text
            style={[
              styles.filterChipText,
              filter === 'low' && styles.filterChipTextActiveLow,
            ]}>
            {t('inventory.filterLow')}
          </Text>
          {lowCount > 0 ? (
            <View style={styles.yellowBadge}>
              <Text style={styles.yellowBadgeText}>{lowCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {lowCount > 0 && filter === 'all' ? (
        <View style={styles.lowBanner}>
          <View style={styles.yellowBadgeLarge}>
            <Text style={styles.yellowBadgeLargeText}>{lowCount}</Text>
          </View>
          <Text style={styles.lowBannerText}>{t('inventory.lowBadge', { count: lowCount })}</Text>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={styles.listContent}
        data={displayed}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={emptyComponent ?? undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchWrap: {
    flex: 1,
  },
  searchInput: {
    ...typography.body,
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.white[50],
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  headerLogButton: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  headerLogButtonText: {
    ...typography.body,
    color: colors.white[300],
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  filterChipActiveLow: {
    backgroundColor: colors.yellow[400],
    borderColor: colors.yellow[400],
  },
  filterChipText: {
    ...typography.caption,
    color: colors.white[300],
  },
  filterChipTextActive: {
    color: colors.black[900],
    fontWeight: '600',
  },
  filterChipTextActiveLow: {
    color: colors.black[900],
    fontWeight: '700',
  },
  yellowBadge: {
    backgroundColor: colors.black[900],
    borderRadius: radius.pill,
    height: 18,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  yellowBadgeText: {
    ...typography.micro,
    color: colors.yellow[400],
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 11,
  },
  lowBanner: {
    alignItems: 'center',
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  yellowBadgeLarge: {
    backgroundColor: colors.yellow[400],
    borderRadius: radius.pill,
    height: 28,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  yellowBadgeLargeText: {
    ...typography.caption,
    color: colors.black[900],
    fontWeight: '700',
  },
  lowBannerText: {
    ...typography.body,
    color: colors.white[50],
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    minHeight: 72,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowInactive: {
    opacity: 0.45,
  },
  rowInfo: {
    flex: 1,
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    ...typography.body,
    color: colors.white[50],
    flexShrink: 1,
  },
  lowPill: {
    backgroundColor: colors.yellow[400],
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  lowPillText: {
    ...typography.micro,
    color: colors.black[900],
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  rowMeta: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionAdjust: {
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionAdjustText: {
    ...typography.caption,
    color: colors.black[900],
    fontWeight: '600',
  },
  actionLog: {
    borderColor: colors.black[600],
    borderWidth: 1,
    borderRadius: radius.button,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLogText: {
    ...typography.caption,
    color: colors.white[300],
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
});
