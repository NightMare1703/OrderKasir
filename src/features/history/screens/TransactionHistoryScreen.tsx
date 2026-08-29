import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import type Transaction from '../../../database/models/transaction';
import type User from '../../../database/models/user';
import { TransactionService, type TransactionFilter } from '../../../services/TransactionService';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';
import type { HistoryStackParamList } from '../../../app/navigation';

type FilterDatePreset = 'all' | 'today' | '7days';

const methodOptions: Array<{ key: string | null; labelKey: string }> = [
  { key: null, labelKey: 'history.filterAll' },
  { key: 'cash', labelKey: 'payment.methodCash' },
  { key: 'qris', labelKey: 'payment.methodQris' },
  { key: 'debit', labelKey: 'payment.methodDebit' },
  { key: 'transfer', labelKey: 'payment.methodTransfer' },
];

const datePresets: Array<{ key: FilterDatePreset; labelKey: string }> = [
  { key: 'all', labelKey: 'history.filterAll' },
  { key: 'today', labelKey: 'history.filterToday' },
  { key: '7days', labelKey: 'history.filter7Days' },
];

type RowProps = {
  transaction: Transaction;
  cashierName: string | null;
  onPress: (id: string) => void;
};

const TransactionRow = React.memo(({ transaction, cashierName, onPress }: RowProps) => {
  const { t } = useTranslation();
  const handlePress = React.useCallback(() => {
    onPress(transaction.id);
  }, [onPress, transaction.id]);

  const statusStyle =
    transaction.status === 'void'
      ? styles.badgeVoid
      : transaction.status === 'debt'
        ? styles.badgeDebt
        : styles.badgePaid;
  const statusLabel =
    transaction.status === 'void'
      ? t('history.statusVoid')
      : transaction.status === 'debt'
        ? t('history.statusDebt')
        : t('history.statusPaid');

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={styles.row}>
      <View style={styles.rowTop}>
        <Text numberOfLines={1} style={styles.rowInvoice}>
          {transaction.invoiceNo}
        </Text>
        <View style={[styles.badge, statusStyle]}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>{statusLabel}</Text>
        </View>
      </View>
      <Text style={styles.rowDate}>{dayjs(transaction.createdAt).format('DD MMM YYYY HH:mm')}</Text>
      <View style={styles.rowBottom}>
        <View style={styles.rowCashierWrap}>
          {cashierName ? <Text style={styles.rowCashier}>{cashierName}</Text> : null}
          <Text style={styles.rowTotal}>{formatRupiah(transaction.total)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});
TransactionRow.displayName = 'TransactionRow';

type ChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

const FilterChip = React.memo(({ label, active, onPress }: ChipProps) => (
  <TouchableOpacity
    accessibilityRole="button"
    onPress={onPress}
    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}>
    <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>{label}</Text>
  </TouchableOpacity>
));
FilterChip.displayName = 'FilterChip';

type ChipWrapperProps = {
  label: string;
  value: string | null;
  selected: string | null;
  onSelect: (v: string | null) => void;
};

const ChipWrapper = React.memo(({ label, value, selected, onSelect }: ChipWrapperProps) => {
  const handlePress = React.useCallback(() => {
    onSelect(value);
  }, [onSelect, value]);
  return <FilterChip active={selected === value} label={label} onPress={handlePress} />;
});
ChipWrapper.displayName = 'ChipWrapper';

const DateChipWrapper = React.memo(
  ({ label, preset, selected, onSelect }: { label: string; preset: FilterDatePreset; selected: FilterDatePreset; onSelect: (v: FilterDatePreset) => void }) => {
    const handlePress = React.useCallback(() => {
      onSelect(preset);
    }, [onSelect, preset]);
    return <FilterChip active={selected === preset} label={label} onPress={handlePress} />;
  },
);
DateChipWrapper.displayName = 'DateChipWrapper';

const CashierChipWrapper = React.memo(
  ({
    user,
    selected,
    onSelect,
  }: {
    user: User;
    selected: string | null;
    onSelect: (v: string | null) => void;
  }) => {
    const handlePress = React.useCallback(() => {
      onSelect(user.id);
    }, [onSelect, user.id]);
    return <FilterChip active={selected === user.id} label={user.name} onPress={handlePress} />;
  },
);
CashierChipWrapper.displayName = 'CashierChipWrapper';

export const TransactionHistoryScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<HistoryStackParamList>>();

  const transactionService = React.useMemo(() => new TransactionService(database), []);

  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [search, setSearch] = React.useState('');
  const [method, setMethod] = React.useState<string | null>(null);
  const [cashierId, setCashierId] = React.useState<string | null>(null);
  const [datePreset, setDatePreset] = React.useState<FilterDatePreset>('all');

  const userMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users) {
      map.set(user.id, user.name);
    }
    return map;
  }, [users]);

  const buildFilter = React.useCallback((): TransactionFilter => {
    const filter: TransactionFilter = {};
    const trimmed = search.trim();
    if (trimmed !== '') {
      filter.searchInvoice = trimmed;
    }
    if (method !== null) {
      filter.method = method as TransactionFilter['method'];
    }
    if (cashierId !== null) {
      filter.userId = cashierId;
    }
    const now = dayjs();
    if (datePreset === 'today') {
      filter.dateFrom = now.startOf('day').valueOf();
      filter.dateTo = now.endOf('day').valueOf();
    } else if (datePreset === '7days') {
      filter.dateFrom = now.subtract(6, 'day').startOf('day').valueOf();
      filter.dateTo = now.endOf('day').valueOf();
    }
    return filter;
  }, [search, method, cashierId, datePreset]);

  const load = React.useCallback(async () => {
    const filter = buildFilter();
    const [rows, allUsers] = await Promise.all([
      transactionService.list(filter),
      database.get<User>('users').query().fetch().catch(() => [] as User[]),
    ]);
    setTransactions(rows);
    const activeUsers = (allUsers as User[]).filter((u) => !u._getRaw('deleted'));
    setUsers(activeUsers);
  }, [transactionService, buildFilter]);

  React.useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  const handleSelectMethod = React.useCallback((value: string | null) => {
    setMethod(value);
  }, []);

  const handleSelectCashier = React.useCallback((value: string | null) => {
    setCashierId(value);
  }, []);

  const handleSelectDate = React.useCallback((value: FilterDatePreset) => {
    setDatePreset(value);
  }, []);

  const handleRowPress = React.useCallback(
    (id: string) => {
      navigation.navigate('HistoryDetail', { transactionId: id });
    },
    [navigation],
  );

  const renderItem = React.useCallback(
    ({ item }: { item: Transaction }) => (
      <TransactionRow transaction={item} cashierName={userMap.get(item.userId) ?? null} onPress={handleRowPress} />
    ),
    [handleRowPress, userMap],
  );

  const keyExtractor = React.useCallback((item: Transaction) => item.id, []);

  const hasActiveFilter = method !== null || cashierId !== null || datePreset !== 'all' || search.trim() !== '';

  const clearFilters = React.useCallback(() => {
    setMethod(null);
    setCashierId(null);
    setDatePreset('all');
    setSearch('');
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          onChangeText={setSearch}
          placeholder={t('history.searchPlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={styles.searchInput}
          value={search}
        />
      </View>

      <View style={styles.filtersBlock}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
          {datePresets.map((preset) => (
            <DateChipWrapper
              key={preset.key}
              label={t(preset.labelKey)}
              preset={preset.key}
              selected={datePreset}
              onSelect={handleSelectDate}
            />
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
          {methodOptions.map((opt) => (
            <ChipWrapper
              key={opt.key ?? 'all'}
              label={t(opt.labelKey)}
              value={opt.key}
              selected={method}
              onSelect={handleSelectMethod}
            />
          ))}
        </ScrollView>

        {users.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
            <ChipWrapper label={t('history.filterAll')} value={null} selected={cashierId} onSelect={handleSelectCashier} />
            {users.map((user) => (
              <CashierChipWrapper key={user.id} user={user} selected={cashierId} onSelect={handleSelectCashier} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.listWrap}>
        <FlashList
          data={transactions}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>
                {hasActiveFilter ? t('history.emptySearchTitle') : t('history.emptyTitle')}
              </Text>
              <Text style={styles.emptyHint}>{t('history.emptyHint')}</Text>
              {hasActiveFilter ? (
                <TouchableOpacity onPress={clearFilters} style={styles.emptyGhostButton}>
                  <Text style={styles.emptyGhostButtonText}>{t('history.filterAll')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          showsVerticalScrollIndicator={false}
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
  filtersBlock: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  filtersContent: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
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
  listWrap: {
    flex: 1,
    minHeight: 200,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl * 2,
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
  rowInvoice: {
    ...typography.heading,
    color: colors.white[50],
    flex: 1,
  },
  badge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginLeft: spacing.sm,
  },
  badgePaid: {
    backgroundColor: colors.green[500] + '22',
    borderColor: colors.green[500],
    borderWidth: 1,
  },
  badgeVoid: {
    backgroundColor: colors.red[500] + '22',
    borderColor: colors.red[500],
    borderWidth: 1,
  },
  badgeDebt: {
    backgroundColor: colors.yellow[400] + '22',
    borderColor: colors.yellow[400],
    borderWidth: 1,
  },
  badgeDot: {
    backgroundColor: colors.white[50],
    borderRadius: 999,
    height: 6,
    width: 6,
    opacity: 0,
  },
  badgeText: {
    ...typography.micro,
    color: colors.white[50],
  },
  rowDate: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  rowCashierWrap: {
    flex: 1,
  },
  rowCashier: {
    ...typography.caption,
    color: colors.white[300],
  },
  rowTotal: {
    ...typography.heading,
    color: colors.white[50],
    marginTop: 2,
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
