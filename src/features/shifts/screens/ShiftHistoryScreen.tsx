import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import dayjs from 'dayjs';

import { database } from '../../../database';
import type Shift from '../../../database/models/shift';
import type User from '../../../database/models/user';
import { ShiftService } from '../../../services/ShiftService';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';
import type { SettingsStackParamList } from '../../../app/navigation';

type Row = {
  shift: Shift;
  cashierName: string;
};

export const ShiftHistoryScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const shiftService = React.useMemo(() => new ShiftService(database), []);

  const [rows, setRows] = React.useState<Row[] | null>(null);

  const load = React.useCallback(async () => {
    const shifts = await shiftService.listShifts();
    const enriched: Row[] = [];
    for (const shift of shifts) {
      let name = shift.userId;
      try {
        const user = await database.get<User>('users').find(shift.userId);
        const deleted = user._getRaw('deleted') as boolean | undefined;
        if (!deleted) name = user.name;
      } catch {
        // fallback to id
      }
      enriched.push({ shift, cashierName: name });
    }
    setRows(enriched);
  }, [shiftService]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  React.useEffect(() => {
    load();
  }, [load]);

  const handlePress = React.useCallback(
    (shiftId: string) => {
      navigation.navigate('ShiftRecap', { shiftId });
    },
    [navigation],
  );

  const renderItem = React.useCallback(
    ({ item }: { item: Row }) => (
      <ShiftRow cashierName={item.cashierName} shift={item.shift} onPress={handlePress} />
    ),
    [handlePress],
  );

  const keyExtractor = React.useCallback((item: Row) => item.shift.id, []);

  if (rows === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('shift.historyTitle')}</Text>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('shift.historyEmptyTitle')}</Text>
        <Text style={styles.emptyHint}>{t('shift.historyEmptyHint')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t('shift.historyTitle')}</Text>
      <View style={styles.listWrap}>
        <FlashList data={rows} keyExtractor={keyExtractor} renderItem={renderItem} />
      </View>
    </View>
  );
};

const ShiftRow = React.memo(
  ({
    shift,
    cashierName,
    onPress,
  }: {
    shift: Shift;
    cashierName: string;
    onPress: (shiftId: string) => void;
  }) => {
    const { t } = useTranslation();
    const handlePress = React.useCallback(() => onPress(shift.id), [onPress, shift.id]);

    const diff = shift.difference;
    const statusLabel = shift.status === 'open' ? t('shift.statusOpen') : t('shift.statusClosed');
    const dateLabel = dayjs(shift.openedAt).format('DD MMM YYYY HH:mm');
    const diffLabel =
      diff === null || diff === undefined
        ? '-'
        : diff === 0
          ? t('shift.differenceZero')
          : diff > 0
            ? t('shift.differencePositive', { amount: formatRupiah(diff) })
            : t('shift.differenceNegative', { amount: formatRupiah(Math.abs(diff)) });

    const diffBadgeStyle =
      diff === null || diff === undefined
        ? styles.badgeNeutral
        : diff === 0
          ? styles.badgeZero
          : diff > 0
            ? styles.badgePositive
            : styles.badgeNegative;

    const diffIcon = diff === null || diff === undefined ? '•' : diff === 0 ? '✓' : diff > 0 ? '↑' : '↓';

    return (
      <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={styles.row}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={styles.cashierName}>
            {cashierName}
          </Text>
          <View style={[styles.statusChip, shift.status === 'open' ? styles.statusOpen : styles.statusClosed]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.dateText}>{dateLabel}</Text>
        <View style={styles.rowBottom}>
          <View>
            <Text style={styles.openingLabel}>{t('shift.openingCashLabel')}</Text>
            <Text style={styles.openingValue}>{formatRupiah(shift.openingCash)}</Text>
          </View>
          <View style={[styles.diffBadge, diffBadgeStyle]}>
            <Text style={styles.diffIcon}>{diffIcon}</Text>
            <Text style={styles.diffText}>{diffLabel}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);
ShiftRow.displayName = 'ShiftRow';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
    padding: spacing.lg,
  },
  header: {
    ...typography.title,
    color: colors.white[50],
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.white[50],
  },
  listWrap: {
    flex: 1,
    minHeight: 200,
  },
  row: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cashierName: {
    ...typography.heading,
    color: colors.white[50],
    flex: 1,
    marginRight: spacing.md,
  },
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusOpen: {
    backgroundColor: colors.orange[500] + '22',
    borderColor: colors.orange[500],
    borderWidth: 1,
  },
  statusClosed: {
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderWidth: 1,
  },
  statusText: {
    ...typography.micro,
    color: colors.white[300],
    textTransform: 'uppercase',
  },
  dateText: {
    ...typography.caption,
    color: colors.white[150],
  },
  rowBottom: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  openingLabel: {
    ...typography.caption,
    color: colors.white[300],
  },
  openingValue: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
    marginTop: 2,
  },
  diffBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeNeutral: { backgroundColor: colors.black[700] },
  badgeZero: { backgroundColor: colors.green[500] + '1A', borderColor: colors.green[500], borderWidth: 1 },
  badgePositive: { backgroundColor: colors.green[500] + '1A', borderColor: colors.green[500], borderWidth: 1 },
  badgeNegative: { backgroundColor: colors.red[500] + '1A', borderColor: colors.red[500], borderWidth: 1 },
  diffIcon: {
    ...typography.caption,
    color: colors.white[50],
    fontWeight: '700',
  },
  diffText: {
    ...typography.caption,
    color: colors.white[50],
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    backgroundColor: colors.black[900],
    flex: 1,
    padding: spacing.xl,
    paddingTop: spacing.xxl * 2,
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
