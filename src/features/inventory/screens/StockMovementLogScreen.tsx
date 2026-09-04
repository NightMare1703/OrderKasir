import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { database } from '../../../database';
import type Product from '../../../database/models/product';
import type StockMovement from '../../../database/models/stock-movement';
import type User from '../../../database/models/user';
import { ProductService } from '../../../services/ProductService';
import { StockService } from '../../../services/StockService';
import { colors, radius, spacing, typography } from '../../../theme';
import type { ProductsStackParamList } from '../../../app/navigation';

type Props = NativeStackScreenProps<ProductsStackParamList, 'StockLog'>;

type EnrichedRow = {
  movement: StockMovement;
  productName: string;
  userName: string | null;
};

const typeBadgeColor: Record<string, string> = {
  in: colors.green[500],
  out: colors.red[500],
  adjustment: colors.yellow[400],
  sale: colors.orange[500],
  void: colors.green[500],
  return: colors.green[500],
};

const typeI18nSuffix: Record<string, string> = {
  in: 'type_in',
  out: 'type_out',
  adjustment: 'type_adjustment',
  sale: 'type_sale',
  void: 'type_void',
  return: 'type_return',
};

const MovementRow = React.memo(
  ({
    row,
    showProductName,
  }: {
    row: EnrichedRow;
    showProductName: boolean;
  }) => {
    const { t } = useTranslation();
    const { movement, productName, userName } = row;
    const suffix = typeI18nSuffix[movement.type] ?? movement.type;
    const labelKey = `inventory.log.${suffix}`;
    const label = (t as (key: string, opts?: unknown) => string)(labelKey, {
      defaultValue: movement.type,
    });
    const badgeColor = typeBadgeColor[movement.type] ?? colors.white[300];
    const qtySign = movement.qty > 0 ? '+' : '';
    const qtyText = `${qtySign}${movement.qty}`;
    const qtyColor = movement.qty > 0 ? colors.green[500] : colors.red[500];
    const dateLabel = dayjs(movement.createdAt).format('DD MMM YYYY, HH.mm');

    return (
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <View style={[styles.typeBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.typeBadgeText}>{label}</Text>
          </View>
          <Text style={styles.rowDate}>{dateLabel}</Text>
        </View>

        {showProductName ? <Text style={styles.rowProduct}>{productName}</Text> : null}

        <View style={styles.rowQtyRow}>
          <Text style={[styles.rowQty, { color: qtyColor }]}>{qtyText}</Text>
          <Text style={styles.rowStockAfter}>
            {t('inventory.log.stockAfter')}: {movement.stockAfter}
          </Text>
        </View>

        <Text style={styles.rowMeta}>
          {movement.stockBefore} → {movement.stockAfter}
          {movement.reason ? ` · ${movement.reason}` : ''}
        </Text>

        {userName ? (
          <Text style={styles.rowUser}>
            {t('inventory.log.user')}: {userName}
          </Text>
        ) : null}

        {movement.refType || movement.refId ? (
          <Text style={styles.rowRef}>
            {t('inventory.log.ref')}: {[movement.refType, movement.refId].filter(Boolean).join(' / ')}
          </Text>
        ) : null}
      </View>
    );
  },
);
MovementRow.displayName = 'MovementRow';

export const StockMovementLogScreen = ({ route, navigation }: Props) => {
  const { t } = useTranslation();
  const productId = route.params.productId;

  const stockService = React.useMemo(() => new StockService(database), []);
  const productService = React.useMemo(() => new ProductService(database), []);

  const [rows, setRows] = React.useState<EnrichedRow[] | null>(null);
  const [product, setProduct] = React.useState<Product | null>(null);
  const [filter] = React.useState<string | null>(null);

  React.useEffect(() => {
    navigation.setOptions({
      headerTitle: product ? product.name : t('inventory.log.title'),
    });
  }, [navigation, product, t]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Jika productId ada, muat produk + mutasi per produk; jika tidak, semua mutasi.
      const [movements, targetProduct] = await Promise.all([
        stockService.listMovements(productId ?? undefined),
        productId ? productService.getById(productId) : Promise.resolve(null),
      ]);
      if (cancelled) return;

      if (targetProduct !== null) {
        setProduct(targetProduct);
      }

      // Resolve nama produk & user untuk tiap movement.
      // Ambil semua produk & user sekali agar tidak N+1 query per baris.
      const productIds = [...new Set(movements.map((m) => m.productId))];
      const userIds = [...new Set(movements.map((m) => m.userId).filter(Boolean))];

      const productMap = new Map<string, string>();
      await Promise.all(
        productIds.map(async (id) => {
          try {
            const p = await database.get<Product>('products').find(id);
            productMap.set(id, p.name);
          } catch {
            productMap.set(id, id.slice(0, 8));
          }
        }),
      );

      const userMap = new Map<string, string>();
      await Promise.all(
        userIds.map(async (id) => {
          try {
            const u = await database.get<User>('users').find(id);
            userMap.set(id, u.name);
          } catch {
            userMap.set(id, id.slice(0, 8));
          }
        }),
      );

      const enriched: EnrichedRow[] = movements.map((movement) => ({
        movement,
        productName: productMap.get(movement.productId) ?? movement.productId,
        userName: userMap.get(movement.userId) ?? null,
      }));

      setRows(enriched);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [productId, productService, stockService]);

  const isSingleProduct = typeof productId === 'string';

  const filteredRows = React.useMemo(() => {
    if (rows === null || filter === null) return rows;
    return rows.filter((r) => r.movement.type === filter);
  }, [rows, filter]);

  const renderItem = React.useCallback(
    ({ item }: { item: EnrichedRow }) => (
      <MovementRow row={item} showProductName={!isSingleProduct} />
    ),
    [isSingleProduct],
  );

  const keyExtractor = React.useCallback((item: EnrichedRow) => item.movement.id, []);

  const emptyComponent = React.useMemo(() => {
    if (rows === null) return null;
    if (rows.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            {t(isSingleProduct ? 'inventory.log.emptyProductTitle' : 'inventory.log.emptyTitle')}
          </Text>
          <Text style={styles.emptyHint}>{t('inventory.log.emptyHint')}</Text>
        </View>
      );
    }
    return null;
  }, [rows, isSingleProduct, t]);

  return (
    <View style={styles.container}>
      <View style={styles.listWrap}>
        <FlashList
          contentContainerStyle={styles.listContent}
          data={filteredRows ?? []}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={emptyComponent ?? undefined}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  listWrap: {
    flex: 1,
    minHeight: 200,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.lg,
  },
  rowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  typeBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  typeBadgeText: {
    ...typography.micro,
    color: colors.black[900],
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  rowDate: {
    ...typography.caption,
    color: colors.white[150],
  },
  rowProduct: {
    ...typography.heading,
    color: colors.white[50],
    marginTop: spacing.sm,
  },
  rowQtyRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  rowQty: {
    ...typography.heading,
    fontSize: 17,
  },
  rowStockAfter: {
    ...typography.caption,
    color: colors.white[150],
  },
  rowMeta: {
    ...typography.body,
    color: colors.white[300],
    marginTop: spacing.xs,
  },
  rowUser: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
  },
  rowRef: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs / 2,
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
