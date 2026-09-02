import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import { ShiftService } from '../../../services/ShiftService';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah, parseRupiahInput } from '../../../utils/money';
import { useSessionStore } from '../../auth/sessionStore';
import type { SettingsStackParamList } from '../../../app/navigation';

export const OpenShiftScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const currentUserId = useSessionStore((state) => state.currentUserId);

  const shiftService = React.useMemo(() => new ShiftService(database), []);

  const [rawInput, setRawInput] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const parsedOpening = React.useMemo(() => parseRupiahInput(rawInput), [rawInput]);
  const preview =
    parsedOpening !== null && Number.isInteger(parsedOpening) && parsedOpening >= 0
      ? formatRupiah(parsedOpening)
      : null;

  const handleChange = React.useCallback((value: string) => {
    setRawInput(value);
    setError(null);
  }, []);

  const handleOpen = React.useCallback(async () => {
    if (currentUserId === null) {
      setError(t('shift.closeGateNoActive'));
      return;
    }
    if (parsedOpening === null || !Number.isInteger(parsedOpening) || parsedOpening < 0) {
      setError(t('shift.openingCashError'));
      return;
    }
    setBusy(true);
    const result = await shiftService.openShift({
      userId: currentUserId,
      openingCash: parsedOpening,
      notes: notes.trim() === '' ? null : notes.trim(),
    });
    setBusy(false);
    if (result.status === 'ok') {
      navigation.navigate('ShiftRecap', { shiftId: result.shift.id });
      return;
    }
    if (result.status === 'active_shift_exists') {
      setError(t('shift.openActiveExists'));
      return;
    }
    if (result.status === 'invalid_opening_cash') {
      setError(t('shift.openingCashError'));
      return;
    }
    if (result.status === 'user_not_found') {
      setError(t('auth.userNotFound'));
    }
  }, [currentUserId, navigation, notes, parsedOpening, shiftService, t]);

  const canSubmit = parsedOpening !== null && !busy;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('shift.openTitle')}</Text>
      <Text style={styles.hint}>{t('shift.openingCashHint')}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t('shift.openingCashLabel')}</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={handleChange}
          placeholder={t('shift.openingCashPlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={styles.input}
          value={rawInput}
        />
        {preview ? <Text style={styles.preview}>{preview}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={[styles.label, styles.notesLabel]}>{t('shift.notesLabel')}</Text>
        <TextInput
          onChangeText={setNotes}
          placeholder={t('shift.notesPlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={[styles.input, styles.notesInput]}
          value={notes}
        />

        <TouchableOpacity
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={handleOpen}
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}>
          <Text style={styles.ctaText}>{t('shift.openAction')}</Text>
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
  card: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  label: {
    ...typography.micro,
    color: colors.white[150],
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  notesLabel: {
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
  notesInput: {
    minHeight: 48,
  },
  preview: {
    ...typography.heading,
    color: colors.white[50],
    marginTop: spacing.sm,
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
