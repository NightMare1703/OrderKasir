import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import { UserService } from '../../../services/UserService';
import { WipeService } from '../../../services/WipeService';
import { useSessionStore } from '../../auth/sessionStore';
import { colors, radius, spacing, typography } from '../../../theme';
import type { SettingsStackParamList } from '../../../app/navigation';

export const WipeDataScreen = (): React.JSX.Element => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const wipeService = React.useMemo(() => new WipeService(database), []);
  const userService = React.useMemo(() => new UserService(database), []);
  const currentUserId = useSessionStore((s) => s.currentUserId);

  const [isAdmin, setIsAdmin] = React.useState(false);
  const [preview, setPreview] = React.useState<{
    totalTransactions: number;
    totalProducts: number;
    totalCustomers: number;
    totalUsers: number;
  } | null>(null);
  const [typed, setTyped] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);
  const [wiping, setWiping] = React.useState(false);

  const load = React.useCallback(async () => {
    const p = await wipeService.getPreview();
    setPreview(p);
    if (currentUserId) {
      const me = await userService.findUser(currentUserId);
      setIsAdmin(me?.role === 'admin');
    } else {
      setIsAdmin(false);
    }
  }, [currentUserId, userService, wipeService]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  React.useEffect(() => {
    navigation.setOptions({ title: t('settings.wipe.title') } as never);
  }, [navigation, t]);

  const canWipe = isAdmin && confirmed && typed.trim() === t('settings.wipe.typedDelete');

  const handleWipe = React.useCallback(async () => {
    if (!isAdmin) {
      Alert.alert(t('settings.wipe.adminOnly'));
      return;
    }
    if (!canWipe) {
      Alert.alert(t('settings.wipe.needConfirm'));
      return;
    }
    setWiping(true);
    try {
      const res = await wipeService.wipeAll({ confirmed: true, confirmText: 'HAPUS' });
      if (res.status === 'ok') {
        Alert.alert(t('settings.wipe.success'));
        setTyped('');
        setConfirmed(false);
        const fresh = await wipeService.getPreview();
        setPreview(fresh);
      } else {
        Alert.alert(t('settings.wipe.failed'));
      }
    } catch {
      Alert.alert(t('settings.wipe.failed'));
    } finally {
      setWiping(false);
    }
  }, [canWipe, isAdmin, t, wipeService]);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      {!isAdmin ? (
        <View style={styles.adminWarning}>
          <Text style={styles.adminWarningText}>{t('settings.wipe.adminOnly')}</Text>
          <Text style={styles.adminWarningSub}>{t('settings.wipe.needAdminLogin')}</Text>
        </View>
      ) : null}

      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>{t('settings.wipe.dangerTitle')}</Text>
        <Text style={styles.dangerSubtitle}>{t('settings.wipe.dangerSubtitle')}</Text>
        <Text style={styles.warning}>{t('settings.wipe.warning')}</Text>
      </View>

      {preview ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.wipe.previewTitle')}</Text>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>{t('settings.wipe.previewTransactions')}</Text>
            <Text style={styles.previewValue}>{preview.totalTransactions}</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>{t('settings.wipe.previewProducts')}</Text>
            <Text style={styles.previewValue}>{preview.totalProducts}</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>{t('settings.wipe.previewCustomers')}</Text>
            <Text style={styles.previewValue}>{preview.totalCustomers}</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>{t('settings.wipe.previewUsers')}</Text>
            <Text style={styles.previewValue}>{preview.totalUsers}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>{t('settings.wipe.confirmLabel')}</Text>
        <TextInput
          autoCapitalize="characters"
          editable={isAdmin}
          placeholder={t('settings.wipe.confirmPlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={styles.input}
          value={typed}
          onChangeText={setTyped}
        />

        <View style={styles.confirmRow}>
          <Switch
            disabled={!isAdmin}
            trackColor={{ false: colors.black[600], true: colors.red[500] }}
            thumbColor={colors.white[50]}
            value={confirmed}
            onValueChange={setConfirmed}
          />
          <Text style={styles.confirmLabel}>{t('settings.wipe.confirmCheckbox')}</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={!canWipe || wiping}
          style={[styles.dangerButton, !canWipe || wiping ? styles.buttonDisabled : null]}
          onPress={handleWipe}>
          <Text style={styles.dangerButtonText}>{wiping ? '…' : t('settings.wipe.action')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  adminWarning: {
    backgroundColor: colors.yellow[400],
    borderRadius: radius.card,
    padding: spacing.md,
  },
  adminWarningText: {
    ...typography.body,
    color: colors.black[900],
    fontWeight: '700',
  },
  adminWarningSub: {
    ...typography.caption,
    color: colors.black[900],
    marginTop: spacing.xs,
  },
  dangerCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.red[500],
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  dangerTitle: {
    ...typography.heading,
    color: colors.red[500],
  },
  dangerSubtitle: {
    ...typography.body,
    color: colors.white[50],
  },
  warning: {
    ...typography.caption,
    color: colors.white[150],
  },
  card: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.white[50],
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewLabel: {
    ...typography.caption,
    color: colors.white[150],
  },
  previewValue: {
    ...typography.caption,
    color: colors.white[50],
    fontWeight: '600',
  },
  label: {
    ...typography.caption,
    color: colors.white[300],
  },
  input: {
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    color: colors.white[50],
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  confirmRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  confirmLabel: {
    ...typography.caption,
    color: colors.white[300],
    flex: 1,
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: colors.red[500],
    borderRadius: radius.card,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  dangerButtonText: {
    ...typography.heading,
    color: colors.white[50],
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
