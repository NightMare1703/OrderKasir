import { useTranslation } from 'react-i18next';
import * as React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
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

type Props = {
  visible: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (received: number) => Promise<boolean>;
};

const DENOMINATION_LABELS: Record<number, string> = {
  20_000: 'payment.shortcut20',
  50_000: 'payment.shortcut50',
  100_000: 'payment.shortcut100',
};

// Bottom sheet pembayaran tunai (T1.9): keypad besar + pecahan shortcut +
// kembalian hijau + validasi uang kurang. Bagian metode lain (QRIS/debit/
// transfer/split/bon) menyusul di T1.10.
export const CashPaymentSheet = ({ visible, total, onClose, onConfirm }: Props) => {
  const { t } = useTranslation();

  const [received, setReceived] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) {
      setReceived(0);
      setError(null);
    }
  }, [visible]);

  const change = calculateChange(total, received);
  const insufficient = isCashInsufficient(total, received);
  const canPay = !busy && total > 0 && !insufficient;

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

  const handlePay = React.useCallback(async () => {
    if (!canPay) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await onConfirm(received);
      if (!ok) {
        setError('errors.checkoutFailed');
      }
    } catch {
      setError('errors.checkoutFailed');
    } finally {
      setBusy(false);
    }
  }, [canPay, onConfirm, received]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <View style={styles.overlay}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={styles.scrim}
        />
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

          <NumericKeypad
            disabled={busy}
            onDelete={handleDelete}
            onDigit={handleDigit}
          />

          {error !== null ? <Text style={styles.errorText}>{t(error)}</Text> : null}

          <TouchableOpacity
            disabled={!canPay}
            onPress={handlePay}
            testID="payment-pay"
            style={[styles.payButton, !canPay && styles.payButtonDisabled]}>
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
  chipsRow: {
    flexDirection: 'row',
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
