import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCartStore, CartItem } from '../cartStore';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';
import { FlashList } from '@shopify/flash-list';

export const CartPanel = () => {
  const { t } = useTranslation();
  const cart = useCartStore();
  const items = cart.items;
  const totals = cart.getTotals();

  const renderItem = React.useCallback(({ item }: { item: CartItem }) => (
    <View style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <Text numberOfLines={1} style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemMeta}>{item.qty} × {formatRupiah(item.unitPrice)}</Text>
      </View>
      <Text style={styles.itemTotal}>{formatRupiah(item.qty * item.unitPrice - (item.discount ? (item.discount.kind === 'amount' ? item.discount.value : Math.floor((item.qty * item.unitPrice) * item.discount.value / 100)) : 0))}</Text>
    </View>
  ), []);

  if (cart.isEmpty()) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('pos.cartBadge', { count: cart.getItemCount() })}</Text>
      
      <View style={styles.listContainer}>
        <FlashList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.productId}
        />
      </View>
      
      <View style={styles.ladder}>
        <View style={styles.ladderRow}>
          <Text style={styles.ladderLabel}>{t('pos.cartSubtotal')}</Text>
          <Text style={styles.ladderValue}>{formatRupiah(totals.subtotal)}</Text>
        </View>
        
        {totals.totalDiscount > 0 && (
          <View style={styles.ladderRow}>
            <Text style={styles.ladderLabel}>{t('pos.cartDiscount')}</Text>
            <Text style={[styles.ladderValue, styles.discount]}>−{formatRupiah(totals.totalDiscount)}</Text>
          </View>
        )}
        
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('pos.cartTotal')}</Text>
          <Text style={styles.totalValue}>{formatRupiah(totals.total)}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.payButton}>
        <Text style={styles.payButtonText}>{t('pos.cartPay')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[700],
    padding: spacing.lg,
    flex: 1,
    borderLeftWidth: 1,
    borderColor: colors.black[600],
  },
  title: {
    ...typography.heading,
    color: colors.white[50],
    marginBottom: spacing.md,
  },
  listContainer: {
    flex: 1,
    marginBottom: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...typography.body,
    color: colors.white[50],
  },
  itemMeta: {
    ...typography.caption,
    color: colors.white[300],
  },
  itemTotal: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  ladder: {
    borderTopWidth: 1,
    borderColor: colors.black[600],
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  ladderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ladderLabel: {
    ...typography.body,
    color: colors.white[300],
  },
  ladderValue: {
    ...typography.body,
    color: colors.white[50],
  },
  discount: {
    color: colors.red[500],
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  totalLabel: {
    ...typography.title,
    color: colors.white[50],
  },
  totalValue: {
    ...typography.display,
    color: colors.orange[500],
  },
  payButton: {
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  payButtonText: {
    ...typography.heading,
    color: colors.black[900],
  },
});
