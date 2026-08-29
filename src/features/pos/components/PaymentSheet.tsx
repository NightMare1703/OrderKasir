import { useTranslation } from 'react-i18next';
import * as React from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { NumericKeypad } from '../../../components/NumericKeypad';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';
import {
  addCashAmount,
  appendCashDigit,
  calculateChange,
  CASH_DENOMINATIONS,
  isCashInsufficient,
  removeCashDigit,
} from '../cashPayment';
import type Customer from '../../../database/models/customer';

export type PaymentMethod = 'cash' | 'qris' | 'debit' | 'transfer';

export type PaymentItem = {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
};

export type PaymentSheetResult =
  | { type: 'cash'; received: number }
  | { type: 'split'; payments: PaymentItem[] }
  | { type: 'bon'; customer: Customer; payments: PaymentItem[] }
  | { type: 'cancel' };

const DENOMINATION_LABELS: Record<number, string> = {
  20_000: 'payment.shortcut20',
  50_000: 'payment.shortcut50',
  100_000: 'payment.shortcut100',
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'payment.methodCash',
  qris: 'payment.methodQris',
  debit: 'payment.methodDebit',
  transfer: 'payment.methodTransfer',
};

const METHOD_ICONS: Record<PaymentMethod, string> = {
  cash: '💵',
  qris: '📱',
  debit: '💳',
  transfer: '🏦',
};

const MAX_SPLIT_METHODS = 3;

type Props = {
  visible: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (result: PaymentSheetResult) => Promise<boolean>;
  customers?: Customer[];
  onCreateCustomer?: (name: string, phone?: string | null, note?: string | null, debtLimit?: number | null) => Promise<Customer>;
};

const initialPaymentItem = (method: PaymentMethod): PaymentItem => ({
  id: `${method}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  method,
  amount: 0,
  reference: null,
});

export const PaymentSheet = ({
  visible,
  total,
  onClose,
  onConfirm,
  customers = [],
  onCreateCustomer,
}: Props) => {
  const { t } = useTranslation();

  const [mode, setMode] = React.useState<'single' | 'split' | 'bon'>('single');
  const [singleMethod, setSingleMethod] = React.useState<PaymentMethod>('cash');
  const [received, setReceived] = React.useState(0);
  const [splitPayments, setSplitPayments] = React.useState<PaymentItem[]>([
    initialPaymentItem('cash'),
  ]);
  const [bonCustomerId, setBonCustomerId] = React.useState<string | null>(null);
  const [bonPayments, setBonPayments] = React.useState<PaymentItem[]>([
    initialPaymentItem('cash'),
  ]);
  const [showCreateCustomer, setShowCreateCustomer] = React.useState(false);
  const [newCustomerName, setNewCustomerName] = React.useState('');
  const [newCustomerPhone, setNewCustomerPhone] = React.useState('');
  const [newCustomerNote, setNewCustomerNote] = React.useState('');
  const [newCustomerDebtLimit, setNewCustomerDebtLimit] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) {
      setMode('single');
      setSingleMethod('cash');
      setReceived(0);
      setSplitPayments([initialPaymentItem('cash')]);
      setBonCustomerId(null);
      setBonPayments([initialPaymentItem('cash')]);
      setShowCreateCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerNote('');
      setNewCustomerDebtLimit('');
      setError(null);
    }
  }, [visible]);

  const change = calculateChange(total, received);
  const insufficient = isCashInsufficient(total, received);
  const canPayCash = !busy && total > 0 && !insufficient;

  const splitTotal = splitPayments.reduce((sum, p) => sum + p.amount, 0);
  const splitRemaining = total - splitTotal;
  const canPaySplit = !busy && splitPayments.length > 0 && splitRemaining === 0 && splitPayments.every(p => p.amount > 0);

  const bonTotal = bonPayments.reduce((sum, p) => sum + p.amount, 0);
  const bonRemaining = total - bonTotal;
  const canPayBon = !busy && bonCustomerId !== null && bonPayments.length > 0 && bonTotal <= total && bonPayments.every(p => p.amount > 0);

  const handleDigit = React.useCallback((digit: string) => {
    setError(null);
    setReceived((current) => appendCashDigit(current, digit));
  }, []);

  const handleDelete = React.useCallback(() => {
    setError(null);
    setReceived((current) => removeCashDigit(current));
  }, []);

  const handleExact = React.useCallback(() => {
    setError(null);
    setReceived(total);
  }, [total]);

  const handleDenomination = React.useCallback((amount: number) => {
    setError(null);
    setReceived((current) => addCashAmount(current, amount));
  }, []);

  const handleSingleMethodChange = React.useCallback((method: PaymentMethod) => {
    setError(null);
    setSingleMethod(method);
    if (method !== 'cash') {
      setReceived(total);
    } else {
      setReceived(0);
    }
  }, [total]);

  const updateSplitPayment = React.useCallback((id: string, field: 'amount' | 'reference' | 'method', value: number | string) => {
    setError(null);
    setSplitPayments((prev) =>
      prev.map((payment) =>
        payment.id === id ? { ...payment, [field]: value as PaymentItem[typeof field] } : payment
      )
    );
  }, []);

  const addSplitPayment = React.useCallback(() => {
    setError(null);
    if (splitPayments.length >= MAX_SPLIT_METHODS) {
      setError(t('payment.splitMaxMethods'));
      return;
    }
    const usedMethods = new Set(splitPayments.map((p) => p.method));
    const allMethods: PaymentMethod[] = ['cash', 'qris', 'debit', 'transfer'];
    const availableMethods = allMethods.filter((m) => !usedMethods.has(m));
    if (availableMethods.length === 0) {
      setError(t('payment.splitMaxMethods'));
      return;
    }
    setSplitPayments((prev) => [...prev, initialPaymentItem(availableMethods[0])]);
  }, [splitPayments, t]);

  const removeSplitPayment = React.useCallback((id: string) => {
    setError(null);
    if (splitPayments.length <= 1) return;
    setSplitPayments((prev) => prev.filter((p) => p.id !== id));
  }, [splitPayments.length]);

  const updateBonPayment = React.useCallback((id: string, field: 'amount' | 'reference' | 'method', value: number | string) => {
    setError(null);
    setBonPayments((prev) =>
      prev.map((payment) =>
        payment.id === id ? { ...payment, [field]: value as PaymentItem[typeof field] } : payment
      )
    );
  }, []);

  const addBonPayment = React.useCallback(() => {
    setError(null);
    if (bonPayments.length >= MAX_SPLIT_METHODS) {
      setError(t('payment.splitMaxMethods'));
      return;
    }
    const usedMethods = new Set(bonPayments.map((p) => p.method));
    const allMethods: PaymentMethod[] = ['cash', 'qris', 'debit', 'transfer'];
    const availableMethods = allMethods.filter((m) => !usedMethods.has(m));
    if (availableMethods.length === 0) {
      setError(t('payment.splitMaxMethods'));
      return;
    }
    setBonPayments((prev) => [...prev, initialPaymentItem(availableMethods[0])]);
  }, [bonPayments, t]);

  const removeBonPayment = React.useCallback((id: string) => {
    setError(null);
    if (bonPayments.length <= 1) return;
    setBonPayments((prev) => prev.filter((p) => p.id !== id));
  }, [bonPayments.length]);

  const handleCreateCustomer = React.useCallback(async () => {
    if (!onCreateCustomer) return;
    const name = newCustomerName.trim();
    if (!name) {
      setError(t('payment.noCustomerSelected'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const customer = await onCreateCustomer(
        name,
        newCustomerPhone.trim() || null,
        newCustomerNote.trim() || null,
        newCustomerDebtLimit ? parseInt(newCustomerDebtLimit, 10) : null
      );
      setBonCustomerId(customer.id);
      setShowCreateCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerNote('');
      setNewCustomerDebtLimit('');
    } catch {
      setError('errors.checkoutFailed');
    } finally {
      setBusy(false);
    }
  }, [onCreateCustomer, newCustomerName, newCustomerPhone, newCustomerNote, newCustomerDebtLimit, t]);

  const handlePay = React.useCallback(async () => {
    if (mode === 'single') {
      if (!canPayCash) return;
      setBusy(true);
      setError(null);
      try {
        const ok = await onConfirm({ type: 'cash', received });
        if (!ok) setError('errors.checkoutFailed');
      } catch {
        setError('errors.checkoutFailed');
      } finally {
        setBusy(false);
      }
    } else if (mode === 'split') {
      if (!canPaySplit) {
        if (splitRemaining !== 0) {
          setError(t('payment.splitSumMismatch'));
        }
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const ok = await onConfirm({ type: 'split', payments: splitPayments });
        if (!ok) setError('errors.checkoutFailed');
      } catch {
        setError('errors.checkoutFailed');
      } finally {
        setBusy(false);
      }
    } else if (mode === 'bon') {
      if (!canPayBon) {
        if (bonCustomerId === null) {
          setError(t('payment.noCustomerSelected'));
        } else if (bonTotal > total) {
          setError(t('payment.splitSumMismatch'));
        }
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const customer = await new Promise<Customer>((resolve, reject) => {
          const found = customers.find((c) => c.id === bonCustomerId);
          if (found) resolve(found);
          else reject(new Error('Customer not found'));
        });
        const ok = await onConfirm({
          type: 'bon',
          customer,
          payments: bonPayments,
        });
        if (!ok) setError('errors.checkoutFailed');
      } catch {
        setError('errors.checkoutFailed');
      } finally {
        setBusy(false);
      }
    }
  }, [
    mode,
    canPayCash,
    canPaySplit,
    canPayBon,
    splitRemaining,
    bonCustomerId,
    bonTotal,
    total,
    received,
    splitPayments,
    bonPayments,
    customers,
    onConfirm,
    t,
  ]);

  const renderSingleMode = () => (
    <View>
      <View style={styles.methodTabs}>
        {(['cash', 'qris', 'debit', 'transfer'] as PaymentMethod[]).map((method) => (
          <TouchableOpacity
            key={method}
            onPress={() => handleSingleMethodChange(method)}
            style={[
              styles.methodTab,
              singleMethod === method && styles.methodTabActive,
            ]}>
            <Text style={[
              styles.methodTabText,
              singleMethod === method && styles.methodTabTextActive,
            ]}>
              {METHOD_ICONS[method]} {t(METHOD_LABELS[method])}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {singleMethod === 'cash' ? (
        <>
          <View style={styles.receivedRow}>
            <Text style={styles.receivedLabel}>{t('payment.received')}</Text>
            <Text
              testID="payment-received"
              style={[styles.receivedValue, received === 0 && styles.receivedEmpty]}>
              {formatRupiah(received)}
            </Text>
          </View>

          <View style={styles.chipsRow}>
            <TouchableOpacity
              testID="payment-exact"
              onPress={handleExact}
              style={styles.chip}>
              <Text style={styles.chipText}>{t('payment.exact')}</Text>
            </TouchableOpacity>
            {CASH_DENOMINATIONS.map((amount) => (
              <TouchableOpacity
                key={amount}
                testID={`payment-shortcut-${amount}`}
                onPress={() => handleDenomination(amount)}
                style={styles.chip}>
                <Text style={styles.chipText}>{t(DENOMINATION_LABELS[amount])}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.changeSlot}>
            {received > 0 && insufficient ? (
              <Text testID="payment-insufficient" style={styles.insufficientText}>
                {t('payment.insufficient', { amount: formatRupiah(-change) })}
              </Text>
            ) : null}
            {received > 0 && !insufficient ? (
              <View style={styles.changeRow}>
                <Text style={styles.changeLabel}>{t('payment.change')}</Text>
                <Text testID="payment-change" style={styles.changeValue}>
                  {formatRupiah(change)}
                </Text>
              </View>
            ) : null}
          </View>

          <NumericKeypad disabled={busy} onDelete={handleDelete} onDigit={handleDigit} />
        </>
      ) : (
        <>
          <TextInput
            testID={`payment-ref-${singleMethod}`}
            placeholder={t('payment.referencePlaceholder')}
            style={styles.refInput}
            value={''}
            onChangeText={() => {}}
            editable={false}
          />
          <Text testID="payment-received" style={styles.receivedValue}>{formatRupiah(total)}</Text>
        </>
      )}
    </View>
  );

  const renderSplitMode = () => (
    <View>
      <Text style={styles.sectionTitle}>{t('payment.splitTitle')}</Text>
      <View style={styles.splitList}>
        {splitPayments.map((payment, _index) => (
          <View key={payment.id} style={styles.splitItem}>
            <TouchableOpacity
              onPress={() => updateSplitPayment(payment.id, 'method', payment.method === 'cash' ? 'qris' : 'cash')}
              style={styles.splitMethodBtn}>
              <Text style={styles.splitMethodText}>
                {METHOD_ICONS[payment.method]} {t(METHOD_LABELS[payment.method])}
              </Text>
            </TouchableOpacity>
            <TextInput
              testID={`split-amount-${payment.id}`}
              keyboardType="numeric"
              placeholder="0"
              style={styles.splitAmountInput}
              value={payment.amount > 0 ? String(payment.amount) : ''}
              onChangeText={(text) => {
                const val = text === '' ? 0 : parseInt(text, 10);
                if (!isNaN(val) && val >= 0) {
                  updateSplitPayment(payment.id, 'amount', val);
                }
              }}
            />
            {payment.method !== 'cash' && (
              <TextInput
                testID={`split-ref-${payment.id}`}
                placeholder={t('payment.referencePlaceholder')}
                style={styles.splitRefInput}
                value={payment.reference ?? ''}
                onChangeText={(text) => updateSplitPayment(payment.id, 'reference', text)}
              />
            )}
            <TouchableOpacity
              onPress={() => removeSplitPayment(payment.id)}
              style={styles.removeBtn}
              disabled={splitPayments.length <= 1}>
              <Text style={styles.removeBtnText}>{t('payment.splitRemove')}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <View style={styles.splitSummary}>
        <Text style={styles.summaryLabel}>{t('payment.splitRemaining', { amount: formatRupiah(Math.abs(splitRemaining)) })}</Text>
        {splitRemaining > 0 ? (
          <Text style={[styles.summaryValue, styles.summaryValueNegative]}>{t('payment.insufficient', { amount: formatRupiah(splitRemaining) })}</Text>
        ) : splitRemaining < 0 ? (
          <Text style={[styles.summaryValue, styles.summaryValueNegative]}>+{formatRupiah(-splitRemaining)}</Text>
        ) : (
          <Text style={styles.summaryValue}>{t('payment.exact')}</Text>
        )}
      </View>
      {splitPayments.length < MAX_SPLIT_METHODS && (
        <TouchableOpacity onPress={addSplitPayment} style={styles.addMethodBtn}>
          <Text style={styles.addMethodBtnText}>+ {t('payment.splitAdd')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderBonMode = () => (
    <View>
      <Text style={styles.sectionTitle}>{t('payment.bonTitle')}</Text>
      <View style={styles.customerPicker}>
        <Text style={styles.pickerLabel}>{t('payment.bonSelectCustomer')}</Text>
        {customers.length > 0 && (
          <TouchableOpacity
            style={[
              styles.pickerBtn,
              bonCustomerId && styles.pickerBtnSelected,
            ]}
            onPress={() => Alert.alert(
              t('payment.bonSelectCustomer'),
              '',
              customers.map((c) => ({
                text: c.name + (c.phone ? ` (${c.phone})` : ''),
                onPress: () => setBonCustomerId(c.id),
                style: bonCustomerId === c.id ? 'default' : 'default',
              })),
            )}>
            <Text style={styles.pickerBtnText}>
              {bonCustomerId
                ? customers.find((c) => c.id === bonCustomerId)?.name ?? t('payment.bonSelectCustomer')
                : t('payment.bonSelectCustomer')}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setShowCreateCustomer(true)} style={styles.createCustomerBtn}>
          <Text style={styles.createCustomerBtnText}>{t('payment.bonCreateCustomer')}</Text>
        </TouchableOpacity>
      </View>

      {showCreateCustomer && (
        <View style={styles.createCustomerForm}>
          <TextInput
            placeholder={t('payment.bonCustomerName')}
            style={styles.formInput}
            value={newCustomerName}
            onChangeText={setNewCustomerName}
            autoFocus
          />
          <TextInput
            placeholder={t('payment.bonCustomerPhone')}
            style={styles.formInput}
            value={newCustomerPhone}
            onChangeText={setNewCustomerPhone}
            keyboardType="phone-pad"
          />
          <TextInput
            placeholder={t('payment.bonCustomerNote')}
            style={styles.formInput}
            value={newCustomerNote}
            onChangeText={setNewCustomerNote}
          />
          <TextInput
            placeholder={t('payment.bonDebtLimit')}
            style={styles.formInput}
            value={newCustomerDebtLimit}
            onChangeText={setNewCustomerDebtLimit}
            keyboardType="numeric"
          />
          <TouchableOpacity onPress={handleCreateCustomer} style={styles.createCustomerSubmit}>
            <Text style={styles.createCustomerSubmitText}>{t('payment.bonCreate')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {bonCustomerId && (
        <View style={styles.splitList}>
          {bonPayments.map((payment) => (
            <View key={payment.id} style={styles.splitItem}>
              <TouchableOpacity
                onPress={() => updateBonPayment(payment.id, 'method', payment.method === 'cash' ? 'qris' : 'cash')}
                style={styles.splitMethodBtn}>
                <Text style={styles.splitMethodText}>
                  {METHOD_ICONS[payment.method]} {t(METHOD_LABELS[payment.method])}
                </Text>
              </TouchableOpacity>
              <TextInput
                testID={`bon-amount-${payment.id}`}
                keyboardType="numeric"
                placeholder="0"
                style={styles.splitAmountInput}
                value={payment.amount > 0 ? String(payment.amount) : ''}
                onChangeText={(text) => {
                  const val = text === '' ? 0 : parseInt(text, 10);
                  if (!isNaN(val) && val >= 0) {
                    updateBonPayment(payment.id, 'amount', val);
                  }
                }}
              />
              {payment.method !== 'cash' && (
                <TextInput
                  testID={`bon-ref-${payment.id}`}
                  placeholder={t('payment.referencePlaceholder')}
                  style={styles.splitRefInput}
                  value={payment.reference ?? ''}
                  onChangeText={(text) => updateBonPayment(payment.id, 'reference', text)}
                />
              )}
              <TouchableOpacity
                onPress={() => removeBonPayment(payment.id)}
                style={styles.removeBtn}
                disabled={bonPayments.length <= 1}>
                <Text style={styles.removeBtnText}>{t('payment.splitRemove')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {bonCustomerId && (
        <View style={styles.splitSummary}>
          <Text style={styles.summaryLabel}>{t('payment.splitRemaining', { amount: formatRupiah(Math.abs(bonRemaining)) })}</Text>
          {bonRemaining > 0 ? (
            <Text style={styles.summaryValue}>Sisa bon: {formatRupiah(bonRemaining)}</Text>
          ) : (
            <Text style={styles.summaryValue}>{t('payment.exact')}</Text>
          )}
        </View>
      )}

      {bonCustomerId && bonPayments.length < MAX_SPLIT_METHODS && (
        <TouchableOpacity onPress={addBonPayment} style={styles.addMethodBtn}>
          <Text style={styles.addMethodBtnText}>+ {t('payment.splitAdd')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <View style={styles.overlay}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.scrim} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('payment.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.totalLabel}>{t('payment.totalDue')}</Text>
          <Text testID="payment-total" style={styles.totalValue}>
            {formatRupiah(total)}
          </Text>

          <View style={styles.modeTabs}>
            {(['single', 'split', 'bon'] as const).map((modeKey) => (
              <TouchableOpacity
                key={modeKey}
                onPress={() => setMode(modeKey)}
                style={[
                  styles.modeTab,
                  mode === modeKey && styles.modeTabActive,
                ]}>
                <Text style={[
                  styles.modeTabText,
                  mode === modeKey && styles.modeTabTextActive,
                ]}>
                  {t(`payment.mode${modeKey.charAt(0).toUpperCase() + modeKey.slice(1)}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'single' && renderSingleMode()}
          {mode === 'split' && renderSplitMode()}
          {mode === 'bon' && renderBonMode()}

          {error !== null ? <Text style={styles.errorText}>{t(error)}</Text> : null}

          <TouchableOpacity
            disabled={
              mode === 'single' ? !canPayCash : mode === 'split' ? !canPaySplit : !canPayBon
            }
            onPress={handlePay}
            testID="payment-pay"
            style={[
              styles.payButton,
              (mode === 'single' ? !canPayCash : mode === 'split' ? !canPaySplit : !canPayBon) && styles.payButtonDisabled,
            ]}>
            <Text style={styles.payButtonText}>{t('payment.pay')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    backgroundColor: colors.black[900],
    bottom: 0,
    left: 0,
    opacity: 0.8,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    backgroundColor: colors.black[800],
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.xl,
    paddingBottom: spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.white[50],
  },
  closeButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  closeButtonText: {
    ...typography.body,
    color: colors.white[300],
  },
  totalLabel: {
    ...typography.caption,
    color: colors.white[150],
  },
  totalValue: {
    ...typography.display,
    color: colors.white[50],
  },
  methodTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  methodTab: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  methodTabActive: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  methodTabText: {
    ...typography.caption,
    color: colors.white[300],
  },
  methodTabTextActive: {
    color: colors.black[900],
    fontWeight: '600',
  },
  modeTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  modeTab: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  modeTabActive: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  modeTabText: {
    ...typography.caption,
    color: colors.white[300],
  },
  modeTabTextActive: {
    color: colors.black[900],
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  chipText: {
    ...typography.caption,
    color: colors.white[50],
  },
  changeSlot: {
    minHeight: typography.heading.fontSize * 2,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  changeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  changeLabel: {
    ...typography.heading,
    color: colors.white[300],
  },
  changeValue: {
    ...typography.display,
    color: colors.green[500],
  },
  insufficientText: {
    ...typography.heading,
    color: colors.red[500],
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.white[50],
    marginBottom: spacing.md,
  },
  splitList: {
    marginBottom: spacing.md,
  },
  splitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  splitMethodBtn: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    minWidth: 90,
  },
  splitMethodText: {
    ...typography.caption,
    color: colors.white[50],
  },
  splitAmountInput: {
    ...typography.body,
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.white[50],
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    textAlign: 'right',
  },
  splitRefInput: {
    ...typography.body,
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.white[50],
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  removeBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  removeBtnText: {
    ...typography.caption,
    color: colors.red[500],
  },
  splitSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.black[600],
  },
  summaryLabel: {
    ...typography.body,
    color: colors.white[300],
  },
  summaryValue: {
    ...typography.heading,
    color: colors.orange[500],
  },
  summaryValueNegative: {
    color: colors.red[500],
  },
  addMethodBtn: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.orange[500],
    borderRadius: radius.button,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
  },
  addMethodBtnText: {
    ...typography.body,
    color: colors.orange[500],
  },
  customerPicker: {
    marginBottom: spacing.lg,
  },
  pickerLabel: {
    ...typography.caption,
    color: colors.white[150],
    marginBottom: spacing.xs,
  },
  pickerBtn: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  pickerBtnSelected: {
    borderColor: colors.orange[500],
  },
  pickerBtnText: {
    ...typography.body,
    color: colors.white[50],
    flex: 1,
  },
  createCustomerBtn: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.orange[500],
    borderRadius: radius.button,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
  },
  createCustomerBtnText: {
    ...typography.body,
    color: colors.orange[500],
  },
  createCustomerForm: {
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
  },
  formInput: {
    ...typography.body,
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.white[50],
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  createCustomerSubmit: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 48,
  },
  createCustomerSubmitText: {
    ...typography.heading,
    color: colors.black[900],
  },
  refInput: {
    ...typography.body,
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.white[50],
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  receivedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  receivedLabel: {
    ...typography.body,
    color: colors.white[300],
  },
  receivedValue: {
    ...typography.heading,
    color: colors.white[50],
  },
  receivedEmpty: {
    color: colors.white[150],
  },
  errorText: {
    ...typography.caption,
    color: colors.red[500],
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  payButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 48,
  },
  payButtonDisabled: {
    backgroundColor: colors.black[500],
  },
  payButtonText: {
    ...typography.heading,
    color: colors.black[900],
  },
});