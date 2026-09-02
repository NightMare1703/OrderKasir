import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import dayjs from 'dayjs';

import { database } from '../../../database';
import type Shift from '../../../database/models/shift';
import { ShiftService, type ShiftSummary } from '../../../services/ShiftService';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah, parseRupiahInput } from '../../../utils/money';
import type { SettingsStackParamList } from '../../../app/navigation';

type CloseRoute = RouteProp<SettingsStackParamList, 'CloseShift'>;

export const CloseShiftScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const route = useRoute<CloseRoute>();
  const { shiftId } = route.params;

  const shiftService = React.useMemo(() => new ShiftService(database), []);

  const [shift, setShift] = React.useState<Shift | null>(null);
  const [summary, setSummary] = React.useState<ShiftSummary | null>(null);
  const [rawInput, setRawInput] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const found = await shiftService.getShiftById(shiftId);
    setShift(found);
    if (found && found.status === 'open') {
      const sum = await shiftService.getShiftSummary(shiftId);
      setSummary(sum);
    }
  }, [shiftId, shiftService]);

  React.useEffect(() => {
    load();
  }, [load]);

  const parsedClosing = React.useMemo(() => parseRupiahInput(rawInput), [rawInput]);

  const previewExpected = summary ? formatRupiah(summary.expectedCash) : null;
  const previewDifference =
    parsedClosing !== null && summary
      ? parsedClosing - summary.expectedCash
      : null;

  const handleClose = React.useCallback(async () => {
    if (parsedClosing === null || !Number.isInteger(parsedClosing) || parsedClosing < 0) {
      setError(t('shift.closingCashError'));
      return;
    }
    setBusy(true);
    const result = await shiftService.closeShift({ shiftId, closingCash: parsedClosing });
    setBusy(false);
    if (result.status === 'ok') {
      navigation.replace('ShiftRecap', { shiftId });
      return;
    }
    if (result.status === 'invalid_closing_cash') {
      setError(t('shift.closingCashError'));
      return;
    }
    if (result.status === 'shift_already_closed') {
      navigation.replace('ShiftRecap', { shiftId });
      return;
    }
    setError(t('errors.checkoutFailed'));
  }, [navigation, parsedClosing, shiftId, shiftService, t]);

  if (shift === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('shift.closeTitle')}</Text>
        <Text style={styles.empty}>{t('shift.closeGateNoActive')}</Text>
      </View>
    );
  }

  if (shift.status === 'closed') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('shift.closeTitle')}</Text>
        <Text style={styles.hint}>{t('shift.statusClosed')}</Text>
        <TouchableOpacity onPress={() => navigation.replace('ShiftRecap', { shiftId })} style={styles.cta}>
          <Text style={styles.ctaText}>{t('shift.recapTitle')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('shift.closeTitle')}</Text>
      <Text style={styles.hint}>
        {t('shift.openedAt')}: {dayjs(shift.openedAt).format('DD MMM YYYY HH:mm')} · {formatRupiah(shift.openingCash)}
      </Text>

      {summary ? (
        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('shift.summaryTransactions')}</Text>
            <Text style={styles.metaValue}>{summary.transactionCount}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('shift.summaryOmzet')}</Text>
            <Text style={styles.metaValue}>{formatRupiah(summary.totalSales)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('shift.summaryDiscount')}</Text>
            <Text style={styles.metaValue}>{formatRupiah(summary.discountTotal)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('shift.summaryVoid')}</Text>
            <Text style={styles.metaValue}>{summary.voidCount}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('shift.summaryDrawerPull')}</Text>
            <Text style={styles.metaValue}>{formatRupiah(summary.drawerPullTotal)}</Text>
          </View>
          <View style={[styles.metaRow, styles.metaExpected]}>
            <Text style={styles.metaLabelEmph}>{t('shift.expectedCashLabel')}</Text>
            <Text style={styles.metaValueEmph}>{previewExpected}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>{t('shift.closingCashLabel')}</Text>
        <Text style={styles.captionHint}>{t('shift.closingCashHint')}</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={(value) => {
            setRawInput(value);
            setError(null);
          }}
          placeholder={t('shift.closingCashPlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={styles.input}
          value={rawInput}
        />
        {parsedClosing !== null ? (
          <Text style={styles.preview}>{formatRupiah(parsedClosing)}</Text>
        ) : null}

        {summary && previewDifference !== null ? (
          <View
            style={[
              styles.diffRow,
              previewDifference === 0
                ? styles.diffZero
                : previewDifference > 0
                  ? styles.diffPositive
                  : styles.diffNegative,
            ]}>
            <Text style={styles.diffIcon}>{previewDifference === 0 ? '✓' : previewDifference > 0 ? '↑' : '↓'}</Text>
            <Text style={styles.diffText}>
              {previewDifference === 0
                ? t('shift.differenceZero')
                : previewDifference > 0
                  ? t('shift.differencePositive', { amount: formatRupiah(previewDifference) })
                  : t('shift.differenceNegative', { amount: formatRupiah(Math.abs(previewDifference)) })}
            </Text>
          </View>
        ) : null}

        {summary ? (
          <Text style={styles.previewExpected}>{t('shift.previewExpected', { amount: previewExpected ?? '-' })}</Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy || parsedClosing === null}
          onPress={handleClose}
          style={[styles.cta, (busy || parsedClosing === null) && styles.ctaDisabled]}>
          <Text style={styles.ctaText}>{t('shift.closeAction')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.white[50],
  },
  hint: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
  },
  empty: {
    ...typography.body,
    color: colors.white[300],
    marginTop: spacing.xl,
  },
  metaCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaExpected: {
    borderTopColor: colors.black[600],
    borderTopWidth: 1,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  metaLabel: {
    ...typography.caption,
    color: colors.white[300],
  },
  metaLabelEmph: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  metaValue: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  metaValueEmph: {
    ...typography.heading,
    color: colors.orange[500],
  },
  card: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  label: {
    ...typography.micro,
    color: colors.white[150],
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  captionHint: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
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
  preview: {
    ...typography.heading,
    color: colors.white[50],
    marginTop: spacing.sm,
  },
  previewExpected: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.md,
  },
  diffRow: {
    alignItems: 'center',
    borderRadius: radius.input,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
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
    flex: 1,
  },
  errorText: {
    ...typography.caption,
    color: colors.red[500],
    marginTop: spacing.sm,
  },
  cta: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
  },
  ctaDisabled: {
    backgroundColor: colors.black[500],
  },
  ctaText: {
    ...typography.heading,
    color: colors.white[50],
  },
});
