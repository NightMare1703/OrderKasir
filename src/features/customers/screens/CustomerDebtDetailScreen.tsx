import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import * as React from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { CustomersStackParamList } from '../../../app/navigation';
import { database } from '../../../database';
import type Debt from '../../../database/models/debt';
import type DebtPayment from '../../../database/models/debt-payment';
import { CustomerService } from '../../../services/CustomerService';
import { DebtService } from '../../../services/DebtService';
import { ShiftService } from '../../../services/ShiftService';
import { useSessionStore } from '../../auth/sessionStore';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah, parseRupiahInput } from '../../../utils/money';

type Props = NativeStackScreenProps<CustomersStackParamList, 'CustomerDebtDetail'>;

const PAYMENT_METHODS = ['cash', 'qris', 'debit', 'transfer'] as const;

type DebtRowProps = {
  debt: Debt;
  onPay: (debt: Debt) => void;
  onEditDueDate: (debt: Debt) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

const DebtRow = ({ debt, onPay, onEditDueDate, t }: DebtRowProps) => {
  const remaining = debt.totalAmount - debt.paidAmount;
  const isPaid = debt.status === 'paid';
  const dueLabel = debt.dueDate ? dayjs(debt.dueDate).format('DD MMM YYYY') : null;
  const isOverdue = debt.dueDate !== null && debt.dueDate < dayjs().startOf('day').valueOf() && !isPaid;
  const isDueToday =
    debt.dueDate !== null &&
    debt.dueDate >= dayjs().startOf('day').valueOf() &&
    debt.dueDate <= dayjs().endOf('day').valueOf() &&
    !isPaid;

  return (
    <View style={styles.debtCard}>
      <View style={styles.debtHeader}>
        <Text style={styles.debtAmount}>{formatRupiah(debt.totalAmount)}</Text>
        <View
          style={[
            styles.statusPill,
            debt.status === 'paid' && styles.statusPillPaid,
            debt.status === 'partial' && styles.statusPillPartial,
            debt.status === 'open' && styles.statusPillOpen,
          ]}>
          <Text
            style={[
              styles.statusPillText,
              debt.status === 'paid' && styles.statusPillTextPaid,
            ]}>
            {t(`debts.status_${debt.status}`)}
          </Text>
        </View>
      </View>
      <Text style={styles.debtMeta}>
        {t('debts.remainingLabel')}: {formatRupiah(remaining)} · {t('debts.createdAtLabel')}:{' '}
        {dayjs(debt.createdAt).format('DD MMM YYYY HH:mm')}
      </Text>
      <View style={styles.dueRow}>
        {dueLabel ? (
          <View
            style={[
              styles.duePill,
              isOverdue && styles.duePillOverdue,
              isDueToday && styles.duePillDueToday,
            ]}>
            <Text
              style={[
                styles.duePillText,
                isOverdue && styles.duePillTextOverdue,
                isDueToday && styles.duePillTextDueToday,
              ]}>
              {isOverdue ? t('debts.overdueLabel', { date: dueLabel }) : isDueToday ? t('debts.dueTodayLabel') : dueLabel}
            </Text>
          </View>
        ) : (
          <Text style={styles.noDue}>{t('debts.noDueDate')}</Text>
        )}
        {!isPaid ? (
          <TouchableOpacity onPress={() => onEditDueDate(debt)} style={styles.editDueButton}>
            <Text style={styles.editDueButtonText}>{t('debts.editDueDate')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {!isPaid ? (
        <TouchableOpacity onPress={() => onPay(debt)} style={styles.payButton}>
          <Text style={styles.payButtonText}>{t('debts.payAction')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export const CustomerDebtDetailScreen = ({ route, navigation }: Props) => {
  const { t } = useTranslation();
  const { customerId } = route.params;
  const currentUserId = useSessionStore((state) => state.currentUserId);

  const debtService = React.useMemo(() => new DebtService(database), []);
  const shiftService = React.useMemo(() => new ShiftService(database), []);
  const customerService = React.useMemo(() => new CustomerService(database), []);

  const [debts, setDebts] = React.useState<Debt[]>([]);
  const [payments, setPayments] = React.useState<DebtPayment[]>([]);
  const [customerName, setCustomerName] = React.useState<string>('');
  const [customerPhone, setCustomerPhone] = React.useState<string | null>(null);
  const [customerLimit, setCustomerLimit] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [outstanding, setOutstanding] = React.useState(0);

  const [settlement, setSettlement] = React.useState<{
    visible: boolean;
    debt: Debt | null;
    remaining: number;
  }>({ visible: false, debt: null, remaining: 0 });
  const [amountInput, setAmountInput] = React.useState('');
  const [method, setMethod] = React.useState<(typeof PAYMENT_METHODS)[number]>('cash');
  const [reference, setReference] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [dueDateModal, setDueDateModal] = React.useState<{ visible: boolean; debt: Debt | null }>({
    visible: false,
    debt: null,
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await debtService.listDebts({ customerId });
      setDebts(list.sort((a, b) => b.createdAt - a.createdAt));
      const outstandingValue = list
        .filter((debt) => debt.status !== 'paid')
        .reduce((sum, debt) => sum + (debt.totalAmount - debt.paidAmount), 0);
      setOutstanding(outstandingValue);

      const customer = await customerService.findCustomer(customerId);
      if (customer) {
        setCustomerName(customer.name);
        setCustomerPhone(customer.phone);
        setCustomerLimit(customer.debtLimit);
        navigation.setOptions({ headerTitle: customer.name });
      }

      const allPayments: DebtPayment[] = [];
      for (const debt of list) {
        const ps = await debtService.listPayments(debt.id);
        allPayments.push(...ps);
      }
      setPayments(allPayments.sort((a, b) => b.paidAt - a.paidAt));
    } finally {
      setLoading(false);
    }
  }, [customerId, customerService, debtService, navigation]);

  React.useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  const openPay = React.useCallback(
    async (debt: Debt) => {
      const detail = await debtService.getDebtDetail(debt.id);
      if (!detail) return;
      setAmountInput(String(detail.remaining));
      setMethod('cash');
      setReference('');
      setError(null);
      setSuccess(null);
      setSettlement({ visible: true, debt, remaining: detail.remaining });
    },
    [debtService],
  );

  const closePay = React.useCallback(() => {
    setSettlement({ visible: false, debt: null, remaining: 0 });
    setError(null);
    setSubmitting(false);
  }, []);

  const submitPay = React.useCallback(async () => {
    if (!settlement.debt) return;
    if (!currentUserId) {
      setError(t('debts.settlementNoUser'));
      return;
    }
    const parsed = parseRupiahInput(amountInput);
    if (parsed === null || parsed <= 0) {
      setError(t('debts.settlementInvalidAmount'));
      return;
    }
    if (parsed > settlement.remaining) {
      setError(t('debts.settlementExceedsRemaining', { amount: formatRupiah(settlement.remaining) }));
      return;
    }
    const activeShift = await shiftService.getActiveShift();
    if (!activeShift) {
      setError(t('debts.settlementNoShift'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await debtService.recordPayment({
      debtId: settlement.debt.id,
      amount: parsed,
      method,
      reference: reference.trim() === '' ? null : reference.trim(),
      userId: currentUserId,
      shiftId: activeShift.id,
    });
    if (result.status === 'ok') {
      setSuccess(t('debts.settlementSuccess'));
      setTimeout(() => {
        closePay();
        load();
      }, 700);
    } else if (result.status === 'amount_exceeds_remaining') {
      setError(t('debts.settlementExceedsRemaining', { amount: formatRupiah(result.remaining) }));
    } else if (result.status === 'already_paid') {
      setError(t('debts.settlementAlreadyPaid'));
    } else {
      setError(t('debts.settlementFailed'));
    }
    setSubmitting(false);
  }, [amountInput, closePay, currentUserId, debtService, load, method, reference, settlement.debt, settlement.remaining, shiftService, t]);

  const handleDueDateUpdate = React.useCallback(
    async (dueDate: number | null) => {
      if (!dueDateModal.debt) return;
      const result = await debtService.updateDueDate(dueDateModal.debt.id, dueDate);
      if (result.status === 'ok') {
        setDueDateModal({ visible: false, debt: null });
        load();
      }
    },
    [debtService, dueDateModal.debt, load],
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.orange[500]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.headerName}>{customerName}</Text>
        {customerPhone ? <Text style={styles.headerPhone}>{customerPhone}</Text> : null}
        <Text style={styles.headerOutstanding}>{formatRupiah(outstanding)}</Text>
        <Text style={styles.headerLabel}>{t('debts.totalOutstandingLabel')}</Text>
        {customerLimit !== null ? (
          <Text style={styles.headerLimit}>
            {t('debts.limitLabel')}: {formatRupiah(customerLimit)}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={debts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>{t('debts.debtsListTitle')}</Text>
            {debts.length === 0 ? (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>{t('debts.customerNoDebts')}</Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <DebtRow
            debt={item}
            onPay={openPay}
            onEditDueDate={(debt) => setDueDateModal({ visible: true, debt })}
            t={t as (k: string, o?: Record<string, unknown>) => string}
          />
        )}
        ListFooterComponent={
          payments.length > 0 ? (
            <View style={styles.paymentsSection}>
              <Text style={styles.sectionTitle}>{t('debts.paymentsHistoryTitle')}</Text>
              {payments.map((payment) => (
                <View key={payment.id} style={styles.paymentRow}>
                  <View style={styles.paymentLeft}>
                    <Text style={styles.paymentAmount}>{formatRupiah(payment.amount)}</Text>
                    <Text style={styles.paymentMeta}>
                      {t(`debts.method_${payment.method}`)} · {dayjs(payment.paidAt).format('DD MMM HH:mm')}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : undefined
        }
      />

      <Modal visible={settlement.visible} transparent animationType="slide" onRequestClose={closePay}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('debts.settlementTitle')}</Text>
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
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {success ? <Text style={styles.successText}>{success}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={closePay} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitPay}
                disabled={submitting}
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}>
                <Text style={styles.submitButtonText}>{submitting ? t('debts.paying') : t('debts.payConfirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={dueDateModal.visible} transparent animationType="fade" onRequestClose={() => setDueDateModal({ visible: false, debt: null })}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.dueModalCard}>
            <Text style={styles.modalTitle}>{t('debts.setDueDateTitle')}</Text>
            <TouchableOpacity onPress={() => handleDueDateUpdate(dayjs().valueOf())} style={styles.dueOption}>
              <Text style={styles.dueOptionText}>{t('debts.dueTodayOption')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDueDateUpdate(dayjs().add(1, 'day').valueOf())} style={styles.dueOption}>
              <Text style={styles.dueOptionText}>{t('debts.dueTomorrowOption')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDueDateUpdate(dayjs().add(7, 'day').valueOf())} style={styles.dueOption}>
              <Text style={styles.dueOptionText}>{t('debts.dueWeekOption')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDueDateUpdate(null)} style={styles.dueOption}>
              <Text style={[styles.dueOptionText, styles.dueOptionDanger]}>{t('debts.clearDueDate')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDueDateModal({ visible: false, debt: null })} style={styles.cancelButtonFull}>
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
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
  headerCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderWidth: 1,
    borderRadius: radius.card,
    margin: spacing.lg,
    padding: spacing.lg,
  },
  headerName: {
    ...typography.title,
    color: colors.white[50],
  },
  headerPhone: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: 2,
  },
  headerOutstanding: {
    ...typography.display,
    color: colors.white[50],
    marginTop: spacing.md,
  },
  headerLabel: {
    ...typography.micro,
    color: colors.white[150],
    textTransform: 'uppercase',
  },
  headerLimit: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  listHeader: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.white[50],
    marginBottom: spacing.sm,
  },
  emptyInline: {
    backgroundColor: colors.black[800],
    borderRadius: radius.card,
    padding: spacing.lg,
    borderColor: colors.black[600],
    borderWidth: 1,
  },
  emptyInlineText: {
    ...typography.body,
    color: colors.white[300],
    textAlign: 'center',
  },
  debtCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  debtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  debtAmount: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.black[700],
  },
  statusPillOpen: {
    backgroundColor: colors.yellow[400],
  },
  statusPillPartial: {
    backgroundColor: colors.orange[500],
  },
  statusPillPaid: {
    backgroundColor: colors.green[500],
  },
  statusPillText: {
    ...typography.micro,
    color: colors.white[300],
    fontWeight: '700',
  },
  statusPillTextPaid: {
    color: colors.white[50],
  },
  debtMeta: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.sm,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  duePill: {
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
  noDue: {
    ...typography.micro,
    color: colors.white[150],
  },
  editDueButton: {
    borderColor: colors.black[600],
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  editDueButtonText: {
    ...typography.micro,
    color: colors.white[300],
  },
  payButton: {
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  payButtonText: {
    ...typography.body,
    color: colors.black[900],
    fontWeight: '700',
  },
  paymentsSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  paymentRow: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentLeft: {
    flex: 1,
  },
  paymentAmount: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  paymentMeta: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: 2,
  },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlayCenter: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.black[800],
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dueModalCard: {
    backgroundColor: colors.black[800],
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: {
    ...typography.heading,
    color: colors.white[50],
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
    borderWidth: 1,
    borderRadius: radius.pill,
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
  },
  successText: {
    ...typography.caption,
    color: colors.green[500],
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
  cancelButtonFull: {
    borderColor: colors.black[600],
    borderWidth: 1,
    borderRadius: radius.button,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
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
  dueOption: {
    backgroundColor: colors.black[700],
    borderRadius: radius.input,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderColor: colors.black[600],
    borderWidth: 1,
  },
  dueOptionText: {
    ...typography.body,
    color: colors.white[50],
  },
  dueOptionDanger: {
    color: colors.red[500],
  },
});
