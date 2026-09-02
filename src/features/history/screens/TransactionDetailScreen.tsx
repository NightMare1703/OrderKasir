import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import dayjs from 'dayjs';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import type Payment from '../../../database/models/payment';
import type TransactionItem from '../../../database/models/transaction-item';
import type User from '../../../database/models/user';
import { MockPrinterAdapter } from '../../../hardware/printer/mockPrinterAdapter';
import { ReceiptService } from '../../../services/ReceiptService';
import { TransactionService } from '../../../services/TransactionService';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';
import type { HistoryStackParamList } from '../../../app/navigation';

type Props = NativeStackScreenProps<HistoryStackParamList, 'HistoryDetail'>;

const methodLabelKey: Record<string, string> = {
  cash: 'payment.methodCash',
  qris: 'payment.methodQris',
  debit: 'payment.methodDebit',
  transfer: 'payment.methodTransfer',
};

export const TransactionDetailScreen = ({ route, navigation }: Props) => {
  const { t } = useTranslation();
  const { transactionId } = route.params;

  const transactionService = React.useMemo(() => new TransactionService(database), []);
  const receiptService = React.useMemo(
    () => new ReceiptService(database, new MockPrinterAdapter()),
    [],
  );

  const [detail, setDetail] = React.useState<ReturnType<TransactionService['getDetail']> extends Promise<infer R> ? R : never>(null as never);
  const [cashierName, setCashierName] = React.useState<string | null>(null);
  const [voidByName, setVoidByName] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [admins, setAdmins] = React.useState<User[]>([]);
  const [selectedAdminId, setSelectedAdminId] = React.useState<string | null>(null);
  const [voidVisible, setVoidVisible] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState('');
  const [voidPin, setVoidPin] = React.useState('');
  const [voidBusy, setVoidBusy] = React.useState(false);
  const [voidError, setVoidError] = React.useState<string | null>(null);
  const [reprintBusy, setReprintBusy] = React.useState(false);
  const [receiptFeedback, setReceiptFeedback] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await transactionService.getDetail(transactionId);
    setDetail(result as unknown as typeof detail);
    if (result) {
      try {
        const user = await database.get<User>('users').find(result.transaction.userId);
        setCashierName(user.name);
      } catch {
        setCashierName(null);
      }
      if (result.transaction.voidByUserId) {
        try {
          const voidBy = await database.get<User>('users').find(result.transaction.voidByUserId);
          setVoidByName(voidBy.name);
        } catch {
          setVoidByName(result.transaction.voidByUserId);
        }
      } else {
        setVoidByName(null);
      }
      const allUsers = await database.get<User>('users').query().fetch().catch(() => [] as User[]);
      const adminList = (allUsers as User[]).filter((u) => !u._getRaw('deleted') && u.role === 'admin' && u.isActive);
      setAdmins(adminList);
      if (adminList.length > 0 && selectedAdminId === null) {
        setSelectedAdminId(adminList[0].id);
      }
    }
    setLoading(false);
  }, [transactionService, transactionId, selectedAdminId]);

  React.useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: t('history.detailTitle') });
  }, [navigation, t]);

  const handleOpenVoid = React.useCallback(() => {
    setVoidReason('');
    setVoidPin('');
    setVoidError(null);
    setVoidVisible(true);
  }, []);

  const handleCloseVoid = React.useCallback(() => {
    if (!voidBusy) {
      setVoidVisible(false);
    }
  }, [voidBusy]);

  const handleVoidConfirm = React.useCallback(async () => {
    if (voidReason.trim() === '') {
      setVoidError(t('history.voidReasonRequired'));
      return;
    }
    if (voidPin.trim() === '') {
      setVoidError(t('history.voidPinRequired'));
      return;
    }
    if (selectedAdminId === null) {
      setVoidError(t('history.voidNotAdmin'));
      return;
    }
    setVoidBusy(true);
    setVoidError(null);
    const result = await transactionService.voidTransaction({
      transactionId,
      reason: voidReason,
      adminUserId: selectedAdminId,
      adminPin: voidPin,
    });
    setVoidBusy(false);
    if (result.status === 'ok') {
      setVoidVisible(false);
      Alert.alert(t('history.statusVoid'), t('history.voidSuccess'));
      await load();
    } else if (result.status === 'reason_required') {
      setVoidError(t('history.voidReasonRequired'));
    } else if (result.status === 'invalid_pin') {
      setVoidError(t('history.voidInvalidPin'));
    } else if (result.status === 'not_admin') {
      setVoidError(t('history.voidNotAdmin'));
    } else if (result.status === 'admin_not_found' || result.status === 'admin_inactive') {
      setVoidError(t('history.voidNotAdmin'));
    } else if (result.status === 'already_void') {
      setVoidError(t('history.voidAlreadyVoid'));
      await load();
    } else {
      setVoidError(t('history.voidFailed'));
    }
  }, [voidReason, voidPin, selectedAdminId, transactionId, transactionService, t, load]);

  const handleReprint = React.useCallback(async () => {
    setReprintBusy(true);
    setReceiptFeedback(null);
    const result = await receiptService.printReceipt(transactionId);
    setReprintBusy(false);
    if (result.status === 'ok') {
      setReceiptFeedback(t('history.reprintSuccess'));
      Alert.alert(t('history.reprint'), t('history.reprintSuccess'));
    } else if (result.status === 'not_found') {
      setReceiptFeedback(t('errors.receiptNotFound'));
      Alert.alert(t('history.reprint'), t('errors.receiptNotFound'));
    } else {
      setReceiptFeedback(result.message);
      Alert.alert(t('history.reprint'), result.message, [
        { text: t('receipt.retry'), onPress: () => handleReprint() },
        { text: t('common.ok'), style: 'cancel' },
      ]);
    }
  }, [receiptService, transactionId, t]);

  const handleShareReceipt = React.useCallback(async () => {
    setReceiptFeedback(null);
    const text = await receiptService.buildShareText(transactionId);
    if (!text) {
      setReceiptFeedback(t('errors.receiptNotFound'));
      return;
    }
    try {
      await Share.share({ message: text });
    } catch {
      setReceiptFeedback(t('history.reprintFailed'));
    }
  }, [receiptService, transactionId, t]);

  if (loading) {
    return (
      <View style={styles.containerCenter}>
        <Text style={styles.loadingText}>{t('common.ok')}...</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.containerCenter}>
        <Text style={styles.emptyTitle}>{t('history.emptySearchTitle')}</Text>
      </View>
    );
  }

  const { transaction, items, payments } = detail;
  const isVoid = transaction.status === 'void';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.label}>{t('history.invoice')}</Text>
              <Text style={styles.value}>{transaction.invoiceNo}</Text>
            </View>
            <View style={[styles.badge, isVoid ? styles.badgeVoid : transaction.status === 'debt' ? styles.badgeDebt : styles.badgePaid]}>
              <Text style={styles.badgeText}>
                {isVoid ? t('history.statusVoid') : transaction.status === 'debt' ? t('history.statusDebt') : t('history.statusPaid')}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.rowPair}>
            <View style={styles.rowPairItem}>
              <Text style={styles.label}>{t('history.date')}</Text>
              <Text style={styles.valueSmall}>{dayjs(transaction.createdAt).format('DD MMM YYYY HH:mm')}</Text>
            </View>
            <View style={styles.rowPairItem}>
              <Text style={styles.label}>{t('history.cashier')}</Text>
              <Text style={styles.valueSmall}>{cashierName ?? transaction.userId}</Text>
            </View>
          </View>

          {transaction.customerId ? (
            <View style={styles.singleRow}>
              <Text style={styles.label}>{t('history.customer')}</Text>
              <Text style={styles.valueSmall}>{transaction.customerId}</Text>
            </View>
          ) : null}

          {isVoid ? (
            <View style={styles.voidInfoBox}>
              <Text style={styles.voidInfoLabel}>{t('history.voidReasonLabel')}: {transaction.voidReason ?? '-'}</Text>
              <Text style={styles.voidInfoMeta}>
                {voidByName ? `${voidByName}` : transaction.voidByUserId ?? ''} · {dayjs(transaction.updatedAt).format('DD MMM YYYY HH:mm')}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('history.items')}</Text>
          {items.map((item: TransactionItem) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemMain}>
                <Text style={styles.itemName}>{item.productNameSnapshot}</Text>
                <Text style={styles.itemMeta}>
                  {item.qty} × {formatRupiah(item.unitPrice)} · {item.unitSnapshot}
                </Text>
                {item.discount > 0 ? (
                  <Text style={styles.itemDiscount}>
                    {t('history.itemDiscount')}: {formatRupiah(item.discount)}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.itemTotal}>{formatRupiah(item.total)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.ladderRow}>
            <Text style={styles.ladderLabel}>{t('history.subtotal')}</Text>
            <Text style={styles.ladderValue}>{formatRupiah(transaction.subtotal)}</Text>
          </View>
          <View style={styles.ladderRow}>
            <Text style={styles.ladderLabel}>{t('history.discount')}</Text>
            <Text style={[styles.ladderValue, transaction.discount > 0 && styles.ladderNegative]}>
              {transaction.discount > 0 ? `- ${formatRupiah(transaction.discount)}` : formatRupiah(0)}
            </Text>
          </View>
          {transaction.tax > 0 ? (
            <View style={styles.ladderRow}>
              <Text style={styles.ladderLabel}>{t('history.tax')}</Text>
              <Text style={styles.ladderValue}>{formatRupiah(transaction.tax)}</Text>
            </View>
          ) : null}
          <View style={[styles.ladderRow, styles.ladderRowTotal]}>
            <Text style={styles.ladderTotalLabel}>{t('history.total')}</Text>
            <Text style={styles.ladderTotalValue}>{formatRupiah(transaction.total)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('history.paymentMethod')}</Text>
          {payments.length === 0 ? (
            <Text style={styles.emptyPayments}>{t('history.statusDebt')} — {t('history.customer')}</Text>
          ) : (
            payments.map((payment: Payment) => (
              <View key={payment.id} style={styles.paymentRow}>
                <Text style={styles.paymentMethod}>{t(methodLabelKey[payment.method] ?? payment.method)}</Text>
                <Text style={styles.paymentAmount}>{formatRupiah(payment.amount)}</Text>
              </View>
            ))
          )}
          {payments.map((payment: Payment) =>
            payment.reference ? (
              <Text key={`${payment.id}-ref`} style={styles.paymentRef}>
                {payment.reference}
              </Text>
            ) : null,
          )}
        </View>

        <View style={styles.receiptActions}>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={reprintBusy}
            onPress={handleReprint}
            style={[styles.reprintButton, reprintBusy && styles.buttonDisabled]}>
            <Text style={styles.reprintButtonText}>{t('history.footerReprint')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleShareReceipt}
            style={styles.shareButton}>
            <Text style={styles.shareButtonText}>{t('history.shareReceipt')}</Text>
          </TouchableOpacity>
        </View>
        {receiptFeedback ? <Text style={styles.receiptFeedback}>{receiptFeedback}</Text> : null}

        {!isVoid ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleOpenVoid}
            style={styles.voidButton}>
            <Text style={styles.voidButtonText}>{t('history.voidAction')}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal animationType="fade" onRequestClose={handleCloseVoid} transparent visible={voidVisible}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity activeOpacity={1} onPress={handleCloseVoid} style={styles.modalScrim} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('history.voidAction')}</Text>
            <Text style={styles.modalHint}>{t('history.voidReasonHint')}</Text>

            {admins.length > 1 ? (
              <View style={styles.adminPicker}>
                <Text style={styles.inputLabel}>{t('history.voidAdminLabel')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminPickerContent}>
                  {admins.map((admin) => (
                    <TouchableOpacity
                      key={admin.id}
                      onPress={() => setSelectedAdminId(admin.id)}
                      style={[styles.adminChip, selectedAdminId === admin.id && styles.adminChipActive]}>
                      <Text style={[styles.adminChipText, selectedAdminId === admin.id && styles.adminChipTextActive]}>{admin.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <Text style={styles.inputLabel}>{t('history.voidReasonLabel')}</Text>
            <TextInput
              placeholder={t('history.voidReasonPlaceholder')}
              placeholderTextColor={colors.white[150]}
              value={voidReason}
              onChangeText={setVoidReason}
              style={styles.input}
              editable={!voidBusy}
            />

            <Text style={styles.inputLabel}>{t('history.voidPinLabel')}</Text>
            <TextInput
              placeholder={t('history.voidPinPlaceholder')}
              placeholderTextColor={colors.white[150]}
              value={voidPin}
              onChangeText={setVoidPin}
              style={styles.input}
              secureTextEntry
              keyboardType="number-pad"
              editable={!voidBusy}
            />

            {voidError ? <Text style={styles.errorText}>{voidError}</Text> : null}

            <View style={styles.modalActions}>
              <TouchableOpacity disabled={voidBusy} onPress={handleCloseVoid} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>{t('history.voidCancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={voidBusy} onPress={handleVoidConfirm} style={[styles.modalConfirm, voidBusy && styles.modalConfirmDisabled]}>
                <Text style={styles.modalConfirmText}>{t('history.voidConfirm')}</Text>
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
  containerCenter: {
    alignItems: 'center',
    backgroundColor: colors.black[900],
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.white[300],
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.white[50],
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  card: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    ...typography.micro,
    color: colors.white[150],
    textTransform: 'uppercase',
  },
  value: {
    ...typography.heading,
    color: colors.white[50],
    marginTop: 2,
  },
  valueSmall: {
    ...typography.body,
    color: colors.white[50],
    marginTop: 2,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderWidth: 1,
  },
  badgePaid: {
    backgroundColor: colors.green[500] + '22',
    borderColor: colors.green[500],
  },
  badgeVoid: {
    backgroundColor: colors.red[500] + '22',
    borderColor: colors.red[500],
  },
  badgeDebt: {
    backgroundColor: colors.yellow[400] + '22',
    borderColor: colors.yellow[400],
  },
  badgeText: {
    ...typography.micro,
    color: colors.white[50],
  },
  divider: {
    backgroundColor: colors.black[600],
    height: 1,
    marginVertical: spacing.lg,
  },
  rowPair: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  rowPairItem: {
    flex: 1,
  },
  singleRow: {
    marginTop: spacing.md,
  },
  voidInfoBox: {
    backgroundColor: colors.red[500] + '14',
    borderColor: colors.red[500] + '44',
    borderRadius: radius.card,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  voidInfoLabel: {
    ...typography.body,
    color: colors.white[50],
  },
  voidInfoMeta: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: 4,
  },
  cardTitle: {
    ...typography.heading,
    color: colors.white[50],
    marginBottom: spacing.lg,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  itemMain: {
    flex: 1,
    paddingRight: spacing.md,
  },
  itemName: {
    ...typography.body,
    color: colors.white[50],
  },
  itemMeta: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: 2,
  },
  itemDiscount: {
    ...typography.caption,
    color: colors.orange[500],
    marginTop: 2,
  },
  itemTotal: {
    ...typography.heading,
    color: colors.white[50],
    fontSize: 15,
  },
  ladderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  ladderRowTotal: {
    borderTopColor: colors.black[600],
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  ladderLabel: {
    ...typography.body,
    color: colors.white[300],
  },
  ladderValue: {
    ...typography.body,
    color: colors.white[50],
  },
  ladderNegative: {
    color: colors.red[500],
  },
  ladderTotalLabel: {
    ...typography.heading,
    color: colors.white[50],
  },
  ladderTotalValue: {
    ...typography.heading,
    color: colors.white[50],
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  paymentMethod: {
    ...typography.body,
    color: colors.white[300],
  },
  paymentAmount: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  paymentRef: {
    ...typography.caption,
    color: colors.white[150],
    marginBottom: spacing.sm,
  },
  emptyPayments: {
    ...typography.body,
    color: colors.white[150],
  },
  receiptActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  reprintButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  reprintButtonText: {
    ...typography.heading,
    color: colors.black[900],
  },
  shareButton: {
    alignItems: 'center',
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.button,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  shareButtonText: {
    ...typography.heading,
    color: colors.white[300],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  receiptFeedback: {
    ...typography.caption,
    color: colors.white[300],
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  voidButton: {
    alignItems: 'center',
    backgroundColor: colors.black[800],
    borderColor: colors.red[500],
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  voidButtonText: {
    ...typography.heading,
    color: colors.red[500],
  },
  bottomSpacer: {
    height: spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    backgroundColor: colors.black[900],
    bottom: 0,
    left: 0,
    opacity: 0.8,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  modalSheet: {
    backgroundColor: colors.black[800],
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.xl,
  },
  modalTitle: {
    ...typography.title,
    color: colors.white[50],
  },
  modalHint: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.xs,
  },
  adminPicker: {
    marginTop: spacing.lg,
  },
  adminPickerContent: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  adminChip: {
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  adminChipActive: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  adminChipText: {
    ...typography.caption,
    color: colors.white[300],
  },
  adminChipTextActive: {
    color: colors.black[900],
    fontWeight: '600',
  },
  inputLabel: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.lg,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.white[50],
    marginTop: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    ...typography.caption,
    color: colors.red[500],
    marginTop: spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  modalCancel: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.button,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  modalCancelText: {
    ...typography.heading,
    color: colors.white[300],
  },
  modalConfirm: {
    alignItems: 'center',
    backgroundColor: colors.red[500],
    borderRadius: radius.button,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  modalConfirmDisabled: {
    opacity: 0.6,
  },
  modalConfirmText: {
    ...typography.heading,
    color: colors.white[50],
  },
});
