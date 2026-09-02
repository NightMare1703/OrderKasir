import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';

import { database } from '../../../database';
import type User from '../../../database/models/user';
import { ShiftService, type ShiftSummary } from '../../../services/ShiftService';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';
import type { SettingsStackParamList } from '../../../app/navigation';

type RecapRoute = RouteProp<SettingsStackParamList, 'ShiftRecap'>;

const DifferenceBadge = ({
  difference,
}: {
  difference: number | null;
}) => {
  const { t } = useTranslation();
  if (difference === null) {
    return (
      <View style={[styles.diffBadge, styles.diffZero]}>
        <Text style={styles.diffIcon}>•</Text>
        <Text style={styles.diffText}>-</Text>
      </View>
    );
  }
  const isZero = difference === 0;
  const isPositive = difference > 0;
  const label = isZero
    ? t('shift.differenceZero')
    : isPositive
      ? t('shift.differencePositive', { amount: formatRupiah(difference) })
      : t('shift.differenceNegative', { amount: formatRupiah(Math.abs(difference)) });

  return (
    <View
      style={[
        styles.diffBadge,
        isZero ? styles.diffZero : isPositive ? styles.diffPositive : styles.diffNegative,
      ]}>
      <Text style={styles.diffIcon}>{isZero ? '✓' : isPositive ? '↑' : '↓'}</Text>
      <Text style={[styles.diffText, !isZero && isPositive ? styles.diffTextGreen : !isZero && !isPositive ? styles.diffTextRed : undefined]}>
        {difference !== null ? label : '-'}
      </Text>
      <Text style={styles.diffLabel}>{t('shift.differenceLabel')}</Text>
    </View>
  );
};

export const ShiftRecapScreen = () => {
  const { t } = useTranslation();
  const route = useRoute<RecapRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const { shiftId } = route.params;

  const shiftService = React.useMemo(() => new ShiftService(database), []);

  const [summary, setSummary] = React.useState<ShiftSummary | null>(null);
  const [cashierName, setCashierName] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const sum = await shiftService.getShiftSummary(shiftId);
      setSummary(sum);
      try {
        const user = await database.get<User>('users').find(sum.shift.userId);
        const deleted = user._getRaw('deleted') as boolean | undefined;
        setCashierName(deleted ? null : user.name);
      } catch {
        setCashierName(null);
      }
    } catch {
      setSummary(null);
    }
  }, [shiftId, shiftService]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  React.useEffect(() => {
    load();
  }, [load]);

  if (!summary) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('shift.recapTitle')}</Text>
        <Text style={styles.hint}>{t('history.emptyTitle')}</Text>
      </View>
    );
  }

  const shift = summary.shift;
  const difference = shift.difference;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <Text style={styles.title}>{shift.status === 'open' ? t('shift.activeLabel') : t('shift.recapTitle')}</Text>
      <Text style={styles.subtitle}>
        {cashierName ? `${t('shift.cashier')}: ${cashierName} · ` : ''}
        {dayjs(shift.openedAt).format('DD MMM YYYY HH:mm')}
        {shift.closedAt ? ` — ${dayjs(shift.closedAt).format('HH:mm')}` : ` · ${t('shift.statusOpen')}`}
      </Text>

      <View style={styles.diffCard}>
        <Text style={styles.heroLabel}>{t('shift.differenceLabel')}</Text>
        <Text
          style={[
            styles.heroAmount,
            difference === null
              ? styles.heroNeutral
              : difference === 0
                ? styles.heroZero
                : difference > 0
                  ? styles.heroPositive
                  : styles.heroNegative,
          ]}>
          {difference === null ? '-' : formatRupiah(difference)}
        </Text>
        <DifferenceBadge difference={difference} />
      </View>

      <View style={styles.card}>
        <Row label={t('shift.openingCashLabel')} value={formatRupiah(shift.openingCash)} />
        <Row label={`${t('shift.methodCash')} (${t('shift.summaryOmzet')})`} value={formatRupiah(summary.cashSales)} />
        {summary.cashDebtPayments > 0 ? (
          <Row label="Pelunasan tunai" value={formatRupiah(summary.cashDebtPayments)} />
        ) : null}
        <Row label={t('shift.summaryDrawerPull')} value={`−${formatRupiah(summary.drawerPullTotal)}`} valueStyle={summary.drawerPullTotal > 0 ? styles.valueRed : undefined} />
        <View style={styles.divider} />
        <Row label={t('shift.expectedCashLabel')} value={formatRupiah(summary.expectedCash)} emph />
        {shift.closingCash !== null ? (
          <Row label={t('shift.closingCashLabel')} value={formatRupiah(shift.closingCash)} emph />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('shift.summaryPerMethod')}</Text>
        <Row label={t('shift.methodCash')} value={formatRupiah(summary.breakdown.cash)} />
        <Row label={t('shift.methodQris')} value={formatRupiah(summary.breakdown.qris)} />
        <Row label={t('shift.methodDebit')} value={formatRupiah(summary.breakdown.debit)} />
        <Row label={t('shift.methodTransfer')} value={formatRupiah(summary.breakdown.transfer)} />
        <View style={styles.divider} />
        <Row label={t('shift.summaryOmzet')} value={formatRupiah(summary.totalSales)} />
        <Row label={t('shift.summaryTransactions')} value={`${summary.transactionCount}`} />
        <Row label={t('shift.summaryDiscount')} value={formatRupiah(summary.discountTotal)} />
        <Row label={t('shift.summaryVoid')} value={`${summary.voidCount}`} />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => navigation.navigate('ShiftHistory')} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>{t('shift.viewHistory')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            const parent = navigation.getParent();
            if (parent) {
              (parent as unknown as { navigate: (name: string, params?: unknown) => void }).navigate(
                'PosTab',
                { screen: 'PosMain' } as unknown as undefined,
              );
            } else {
              navigation.goBack();
            }
          }}
          style={styles.primaryButton}>
          <Text style={styles.primaryText}>{t('shift.backToPos')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const Row = ({
  label,
  value,
  emph,
  valueStyle,
}: {
  label: string;
  value: string;
  emph?: boolean;
  valueStyle?: object;
}) => (
  <View style={styles.row}>
    <Text style={emph ? styles.rowLabelEmph : styles.rowLabel}>{label}</Text>
    <Text style={[emph ? styles.rowValueEmph : styles.rowValue, valueStyle]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.white[50],
  },
  subtitle: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
  },
  hint: {
    ...typography.body,
    color: colors.white[300],
    marginTop: spacing.lg,
  },
  diffCard: {
    alignItems: 'center',
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  heroLabel: {
    ...typography.micro,
    color: colors.white[150],
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroAmount: {
    ...typography.display,
    fontWeight: '700',
  },
  heroNeutral: { color: colors.white[300] },
  heroZero: { color: colors.green[500] },
  heroPositive: { color: colors.green[500] },
  heroNegative: { color: colors.red[500] },
  diffBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  diffZero: {
    backgroundColor: colors.black[700],
  },
  diffPositive: {
    backgroundColor: colors.green[500] + '1A',
    borderColor: colors.green[500],
    borderWidth: 1,
  },
  diffNegative: {
    backgroundColor: colors.red[500] + '1A',
    borderColor: colors.red[500],
    borderWidth: 1,
  },
  diffIcon: {
    ...typography.heading,
    color: colors.white[50],
  },
  diffText: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  diffTextGreen: { color: colors.green[500] },
  diffTextRed: { color: colors.red[500] },
  diffLabel: {
    ...typography.micro,
    color: colors.white[150],
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    ...typography.heading,
    color: colors.white[50],
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    ...typography.body,
    color: colors.white[300],
  },
  rowLabelEmph: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  rowValue: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  rowValueEmph: {
    ...typography.heading,
    color: colors.white[50],
  },
  valueRed: {
    color: colors.red[500],
  },
  divider: {
    backgroundColor: colors.black[600],
    height: 1,
    marginVertical: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  primaryText: {
    ...typography.heading,
    color: colors.white[50],
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.button,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  secondaryText: {
    ...typography.heading,
    color: colors.white[300],
  },
});
