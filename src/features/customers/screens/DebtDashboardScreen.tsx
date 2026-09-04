import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { CustomersStackParamList } from '../../../app/navigation';
import { database } from '../../../database';
import type Customer from '../../../database/models/customer';
import type Debt from '../../../database/models/debt';
import {
  CustomerOutstandingAggregate,
  DebtDueFilter,
  DebtService,
} from '../../../services/DebtService';
import { DebtReminderService } from '../../../services/DebtReminderService';
import { ShiftService } from '../../../services/ShiftService';
import { useSessionStore } from '../../auth/sessionStore';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah, parseRupiahInput } from '../../../utils/money';

type NavigationProp = NativeStackNavigationProp<CustomersStackParamList, 'DebtDashboard'>;

type FilterChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: number;
};

const FilterChip = ({ label, active, onPress, badge }: FilterChipProps) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.filterChip, active && styles.filterChipActive]}>
    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    {typeof badge === 'number' && badge > 0 ? (
      <View style={styles.filterBadge}>
        <Text style={styles.filterBadgeText}>{badge}</Text>
      </View>
    ) : null}
  </TouchableOpacity>
);

type SettlementState = {
  visible: boolean;
  debt: Debt | null;
  customer: Customer | null;
  remaining: number;
};

const PAYMENT_METHODS = ['cash', 'qris', 'debit', 'transfer'] as const;

export const DebtDashboardScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const currentUserId = useSessionStore((state) => state.currentUserId);

  const debtService = useMemo(() => new DebtService(database), []);
  const debtReminderService = useMemo(() => new DebtReminderService(database), []);
  const shiftService = useMemo(() => new ShiftService(database), []);

  const [filter, setFilter] = useState<DebtDueFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [dueTodayCount, setDueTodayCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [aggregates, setAggregates] = useState<CustomerOutstandingAggregate[]>([]);
  const [reminderCount, setReminderCount] = useState(0);
  const [reminderEnabled, setReminderEnabled] = useState(true);

  const [settlement, setSettlement] = useState<SettlementState>({
    visible: false,
    debt: null,
    customer: null,
    remaining: 0,
  });
  const [amountInput, setAmountInput] = useState('');
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('cash');
  const [reference, setReference] = useState('');
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementSuccess, setSettlementSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await debtService.getDashboardSummary();
      setTotalOutstanding(summary.totalOutstanding);
      setDueTodayCount(summary.dueTodayCount);
      setOverdueCount(summary.overdueCount);
      setReminderCount(summary.dueTodayCount + summary.overdueCount);

      const enabled = await debtReminderService.isEnabled();
      setReminderEnabled(enabled);

      const aggs = await debtService.getCustomerAggregates(filter);
      setAggregates(aggs);
    } finally {
      setLoading(false);
    }
  }, [debtService, debtReminderService, filter]);

  React.useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  React.useEffect(() => {
    navigation.setOptions({
      headerTitle: t('debts.title'),
    });
  }, [navigation, t]);

  const filteredAggregates = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term === '') return aggregates;
    return aggregates.filter((agg) => {
      const name = agg.customer?.name ?? '';
      return name.toLowerCase().includes(term);
    });
  }, [aggregates, query]);

  const openSettlement = useCallback(
    async (debt: Debt) => {
      const detail = await debtService.getDebtDetail(debt.id);
      if (!detail) return;
      setAmountInput(String(detail.remaining));
      setMethod('cash');
      setReference('');
      setSettlementError(null);
      setSettlementSuccess(null);
      setSettlement({
        visible: true,
        debt,
        customer: detail.customer,
        remaining: detail.remaining,
      });
    },
    [debtService],
  );

  const closeSettlement = useCallback(() => {
    setSettlement({ visible: false, debt: null, customer: null, remaining: 0 });
    setSettlementError(null);
    setSettlementLoading(false);
  }, []);

  const handleSettlementSubmit = useCallback(async () => {
    if (!settlement.debt) return;
    if (!currentUserId) {
      setSettlementError(t('debts.settlementNoUser'));
      return;
    }
    const parsed = parseRupiahInput(amountInput);
    if (parsed === null || parsed <= 0) {
      setSettlementError(t('debts.settlementInvalidAmount'));
      return;
    }
    if (parsed > settlement.remaining) {
      setSettlementError(t('debts.settlementExceedsRemaining', { amount: formatRupiah(settlement.remaining) }));
      return;
    }
    const activeShift = await shiftService.getActiveShift();
    if (!activeShift) {
      setSettlementError(t('debts.settlementNoShift'));
      return;
    }
    setSettlementLoading(true);
    setSettlementError(null);
    const result = await debtService.recordPayment({
      debtId: settlement.debt.id,
      amount: parsed,
      method,
      reference: reference.trim() === '' ? null : reference.trim(),
      userId: currentUserId,
      shiftId: activeShift.id,
    });
    if (result.status === 'ok') {
      setSettlementSuccess(t('debts.settlementSuccess'));
      setTimeout(() => {
        closeSettlement();
        load();
      }, 800);
    } else if (result.status === 'amount_exceeds_remaining') {
      setSettlementError(t('debts.settlementExceedsRemaining', { amount: formatRupiah(result.remaining) }));
    } else if (result.status === 'already_paid') {
      setSettlementError(t('debts.settlementAlreadyPaid'));
    } else if (result.status === 'invalid_amount') {
      setSettlementError(t('debts.settlementInvalidAmount'));
    } else {
      setSettlementError(t('debts.settlementFailed'));
    }
    setSettlementLoading(false);
  }, [
    amountInput,
    closeSettlement,
    currentUserId,
    debtService,
    load,
    method,
    reference,
    settlement.debt,
    settlement.remaining,
    shiftService,
    t,
  ]);

  const toggleReminder = useCallback(async () => {
    const next = !reminderEnabled;
    await debtReminderService.setEnabled(next);
    setReminderEnabled(next);
  }, [debtReminderService, reminderEnabled]);

  const handleCustomerPress = useCallback(
    (aggregate: CustomerOutstandingAggregate) => {
      navigation.navigate('CustomerDebtDetail', { customerId: aggregate.customerId });
    },
    [navigation],
  );

  const renderAggregate = useCallback(
    ({ item }: { item: CustomerOutstandingAggregate }) => {
      const customerName = item.customer?.name ?? t('debts.unknownCustomer');
      const phone = item.customer?.phone ?? null;
      const remaining = item.outstanding;
      const dueLabel =
        item.earliestDueDate !== null ? dayjs(item.earliestDueDate).format('DD MMM YYYY') : null;
      const isOverdue =
        item.earliestDueDate !== null && item.earliestDueDate < dayjs().startOf('day').valueOf();
      const isDueToday =
        item.earliestDueDate !== null &&
        item.earliestDueDate >= dayjs().startOf('day').valueOf() &&
        item.earliestDueDate <= dayjs().endOf('day').valueOf();

      return (
        <TouchableOpacity
          onPress={() => handleCustomerPress(item)}
          style={styles.card}
          activeOpacity={0.8}>
          <View style={styles.cardHeader}>
            <View style={styles.cardCustomer}>
              <Text numberOfLines={1} style={styles.customerName}>
                {customerName}
              </Text>
              {phone ? <Text style={styles.customerPhone}>{phone}</Text> : null}
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.cardAmount}>{formatRupiah(remaining)}</Text>
              <Text style={styles.cardCount}>{t('debts.debtCount', { count: item.debtCount })}</Text>
            </View>
          </View>
          <View style={styles.cardFooter}>
            <View style={styles.cardFooterLeft}>
              {dueLabel ? (
                <View
                  style={[
                    styles.duePill,
                    isOverdue && styles.duePillOverdue,
                    isDueToday && !isOverdue && styles.duePillDueToday,
                  ]}>
                  <Text
                    style={[
                      styles.duePillText,
                      isOverdue && styles.duePillTextOverdue,
                      isDueToday && !isOverdue && styles.duePillTextDueToday,
                    ]}>
                    {isOverdue
                      ? t('debts.overdueLabel', { date: dueLabel })
                      : isDueToday
                        ? t('debts.dueTodayLabel')
                        : t('debts.dueDateLabel', { date: dueLabel })}
                  </Text>
                </View>
              ) : (
                <Text style={styles.dueEmpty}>{t('debts.noDueDate')}</Text>
              )}
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={() => {
                  const firstDebt = item.debts[0];
                  if (firstDebt) openSettlement(firstDebt);
                }}
                style={styles.payButton}>
                <Text style={styles.payButtonText}>{t('debts.payAction')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleCustomerPress, openSettlement, t],
  );

  const keyExtractor = useCallback((item: CustomerOutstandingAggregate) => item.customerId, []);

  const emptyComponent = useMemo(() => {
    if (loading) return null;
    if (filteredAggregates.length > 0) return null;
    if (aggregates.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>{t('debts.emptyTitle')}</Text>
          <Text style={styles.emptyHint}>{t('debts.emptyHint')}</Text>
          <TouchableOpacity
            onPress={() => setQuery('')}
            style={styles.emptyCta}>
            <Text style={styles.emptyCtaText}>{t('debts.emptyCta')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('debts.emptySearchTitle', { query: query.trim() })}</Text>
      </View>
    );
  }, [aggregates.length, filteredAggregates.length, loading, query, t]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.orange[500]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>{t('debts.totalOutstandingLabel')}</Text>
        <Text style={styles.totalAmount}>{formatRupiah(totalOutstanding)}</Text>
        <Text style={styles.totalSub}>
          {t('debts.totalCustomersLabel', { count: aggregates.length })} ·{' '}
          {t('debts.totalDebtsLabel', { count: dueTodayCount + overdueCount + aggregates.reduce((a, b) => a + b.debtCount, 0) })}
        </Text>
      </View>

      {reminderCount > 0 && reminderEnabled ? (
        <View style={styles.reminderBanner}>
          <View style={styles.reminderDot} />
          <Text style={styles.reminderText}>
            {overdueCount > 0
              ? t('debts.reminderOverdue', { count: overdueCount })
              : t('debts.reminderDueToday', { count: dueTodayCount })}
          </Text>
        </View>
      ) : null}

      <View style={styles.controlsRow}>
        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('debts.searchPlaceholder')}
            placeholderTextColor={colors.white[150]}
            style={styles.searchInput}
          />
        </View>
        <TouchableOpacity onPress={toggleReminder} style={styles.reminderToggle}>
          <Text style={styles.reminderToggleText}>
            {reminderEnabled ? t('debts.reminderOn') : t('debts.reminderOff')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <FilterChip
          label={t('debts.filterAll')}
          active={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <FilterChip
          label={t('debts.filterDueToday')}
          active={filter === 'due_today'}
          onPress={() => setFilter('due_today')}
          badge={dueTodayCount}
        />
        <FilterChip
          label={t('debts.filterOverdue')}
          active={filter === 'overdue'}
          onPress={() => setFilter('overdue')}
          badge={overdueCount}
        />
      </View>

      <View style={styles.listWrap}>
        <FlashList
          data={filteredAggregates}
          keyExtractor={keyExtractor}
          renderItem={renderAggregate}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={emptyComponent ?? undefined}
        />
      </View>

      <Modal
        visible={settlement.visible}
        transparent
        animationType="slide"
        onRequestClose={closeSettlement}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('debts.settlementTitle')}</Text>
            {settlement.customer ? (
              <Text style={styles.modalCustomer}>
                {settlement.customer.name}
                {settlement.customer.phone ? ` · ${settlement.customer.phone}` : ''}
              </Text>
            ) : null}
            <Text style={styles.modalRemaining}>
              {t('debts.remainingLabel')}: {formatRupiah(settlement.remaining)}
            </Text>

            <Text style={styles.fieldLabel}>{t('debts.amountLabel')}</Text>
            <TextInput
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="numeric"
              placeholder={t('debts.amountPlaceholder')}
              placeholderTextColor={colors.white[150]}
              style={styles.modalInput}
            />

            <Text style={styles.fieldLabel}>{t('debts.methodLabel')}</Text>
            <View style={styles.methodRow}>
              {PAYMENT_METHODS.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setMethod(m)}
                  style={[styles.methodChip, method === m && styles.methodChipActive]}>
                  <Text style={[styles.methodChipText, method === m && styles.methodChipTextActive]}>
                    {t(`debts.method_${m}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{t('debts.referenceLabel')}</Text>
            <TextInput
              value={reference}
              onChangeText={setReference}
              placeholder={t('debts.referencePlaceholder')}
              placeholderTextColor={colors.white[150]}
              style={styles.modalInput}
            />

            {settlementError ? <Text style={styles.errorText}>{settlementError}</Text> : null}
            {settlementSuccess ? <Text style={styles.successText}>{settlementSuccess}</Text> : null}

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={closeSettlement} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSettlementSubmit}
                disabled={settlementLoading}
                style={[styles.submitButton, settlementLoading && styles.submitButtonDisabled]}>
                <Text style={styles.submitButtonText}>
                  {settlementLoading ? t('debts.paying') : t('debts.payConfirm')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    margin: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  totalLabel: {
    ...typography.micro,
    color: colors.white[150],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  totalAmount: {
    ...typography.display,
    color: colors.white[50],
    marginTop: spacing.xs,
  },
  totalSub: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.sm,
  },
  reminderBanner: {
    alignItems: 'center',
    backgroundColor: colors.red[500],
    borderRadius: radius.card,
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  reminderDot: {
    backgroundColor: colors.white[50],
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  reminderText: {
    ...typography.caption,
    color: colors.white[50],
    flex: 1,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
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
  reminderToggle: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  reminderToggleText: {
    ...typography.caption,
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
    gap: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
  },
  filterChipActive: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  filterChipText: {
    ...typography.caption,
    color: colors.white[300],
  },
  filterChipTextActive: {
    color: colors.black[900],
    fontWeight: '600',
  },
  filterBadge: {
    backgroundColor: colors.black[900],
    borderRadius: radius.pill,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    ...typography.micro,
    color: colors.white[50],
    fontSize: 11,
    lineHeight: 11,
    fontWeight: '700',
  },
  listWrap: {
    flex: 1,
    minHeight: 200,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardCustomer: {
    flex: 1,
  },
  customerName: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  customerPhone: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  cardAmount: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '700',
  },
  cardCount: {
    ...typography.micro,
    color: colors.white[150],
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  cardFooterLeft: {
    flex: 1,
  },
  duePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.black[700],
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  duePillDueToday: {
    backgroundColor: colors.yellow[400],
  },
  duePillOverdue: {
    backgroundColor: colors.red[500],
  },
  duePillText: {
    ...typography.micro,
    color: colors.white[300],
    fontWeight: '600',
  },
  duePillTextDueToday: {
    color: colors.black[900],
  },
  duePillTextOverdue: {
    color: colors.white[50],
  },
  dueEmpty: {
    ...typography.micro,
    color: colors.white[150],
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  payButton: {
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payButtonText: {
    ...typography.caption,
    color: colors.black[900],
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
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
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
  },
  emptyCtaText: {
    ...typography.body,
    color: colors.black[900],
    fontWeight: '700',
  },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.black[800],
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  modalTitle: {
    ...typography.heading,
    color: colors.white[50],
  },
  modalCustomer: {
    ...typography.caption,
    color: colors.white[300],
  },
  modalRemaining: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  fieldLabel: {
    ...typography.micro,
    color: colors.white[150],
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  modalInput: {
    ...typography.body,
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.white[50],
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  methodChip: {
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  methodChipActive: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  methodChipText: {
    ...typography.caption,
    color: colors.white[300],
  },
  methodChipTextActive: {
    color: colors.black[900],
    fontWeight: '700',
  },
  errorText: {
    ...typography.caption,
    color: colors.red[500],
    marginTop: spacing.sm,
  },
  successText: {
    ...typography.caption,
    color: colors.green[500],
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelButton: {
    flex: 1,
    borderColor: colors.black[600],
    borderWidth: 1,
    borderRadius: radius.button,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    ...typography.body,
    color: colors.white[300],
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    ...typography.body,
    color: colors.black[900],
    fontWeight: '700',
  },
});
