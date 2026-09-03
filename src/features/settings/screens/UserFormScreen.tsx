import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import { UserService } from '../../../services/UserService';
import { colors, radius, spacing, typography } from '../../../theme';
import type { SettingsStackParamList } from '../../../app/navigation';

type Props = NativeStackScreenProps<SettingsStackParamList, 'UserForm'>;

export const UserFormScreen = (): React.JSX.Element => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const route = useRoute<Props['route']>();
  const userId = route.params?.userId ?? null;
  const isEdit = Boolean(userId);

  const service = React.useMemo(() => new UserService(database), []);

  const [name, setName] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [role, setRole] = React.useState<'admin' | 'kasir'>('kasir');
  const [isActive, setIsActive] = React.useState(true);
  const [loading, setLoading] = React.useState(isEdit);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const user = await service.findUser(userId);
      if (user) {
        setName(user.name);
        setRole(user.role);
        setIsActive(user.isActive);
      }
    } finally {
      setLoading(false);
    }
  }, [service, userId]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    navigation.setOptions({
      title: t(isEdit ? 'settings.users.formEditTitle' : 'settings.users.formCreateTitle'),
    } as never);
  }, [isEdit, navigation, t]);

  const handleSave = React.useCallback(async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      Alert.alert(t('settings.users.invalidName'));
      return;
    }
    if (!isEdit && (pin.trim() === '' || !/^\d+$/.test(pin) || pin.length < 4)) {
      Alert.alert(t('settings.users.invalidPin'));
      return;
    }
    if (isEdit && pin.trim() !== '' && (!/^\d+$/.test(pin) || pin.length < 4)) {
      Alert.alert(t('settings.users.invalidPin'));
      return;
    }

    setSaving(true);
    try {
      if (!isEdit) {
        const res = await service.createUser({ name: trimmedName, pin: pin.trim(), role, isActive });
        if (res.status === 'ok') {
          Alert.alert(t('settings.users.saveSuccess'));
          navigation.goBack();
        } else if (res.status === 'invalid_name') {
          Alert.alert(t('settings.users.invalidName'));
        } else if (res.status === 'invalid_pin') {
          Alert.alert(t('settings.users.invalidPin'));
        } else {
          Alert.alert(t('settings.users.saveFailed'));
        }
      } else {
        const updateInput: { name: string; role: 'admin' | 'kasir'; isActive: boolean; pin?: string | null } = {
          name: trimmedName,
          role,
          isActive,
        };
        if (pin.trim() !== '') updateInput.pin = pin.trim();
        const res = await service.updateUser(userId!, updateInput);
        if (res.status === 'ok') {
          Alert.alert(t('settings.users.saveSuccess'));
          navigation.goBack();
        } else if (res.status === 'invalid_name') {
          Alert.alert(t('settings.users.invalidName'));
        } else if (res.status === 'invalid_pin') {
          Alert.alert(t('settings.users.invalidPin'));
        } else if (res.status === 'cannot_disable_last_admin') {
          Alert.alert(t('settings.users.cannotDisableLastAdmin'));
        } else if (res.status === 'cannot_change_last_admin_role') {
          Alert.alert(t('settings.users.cannotChangeLastAdminRole'));
        } else if (res.status === 'user_not_found') {
          Alert.alert(t('settings.users.saveFailed'));
        } else {
          Alert.alert(t('settings.users.saveFailed'));
        }
      }
    } catch {
      Alert.alert(t('settings.users.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [isActive, isEdit, name, navigation, pin, role, service, t, userId]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.hint}>…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>{t('settings.users.nameLabel')}</Text>
        <TextInput
          maxLength={100}
          placeholder={t('settings.users.namePlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={styles.input}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>{t('settings.users.pinLabel')}</Text>
        <TextInput
          keyboardType="number-pad"
          maxLength={6}
          placeholder={t('settings.users.pinPlaceholder')}
          placeholderTextColor={colors.white[150]}
          secureTextEntry
          style={styles.input}
          value={pin}
          onChangeText={setPin}
        />
        <Text style={styles.hintSmall}>
          {isEdit ? t('settings.users.pinHintEdit') : t('settings.users.pinHintCreate')}
        </Text>

        <Text style={styles.label}>{t('settings.users.roleLabel')}</Text>
        <View style={styles.roleRow}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.roleChip, role === 'kasir' ? styles.roleChipActive : null]}
            onPress={() => setRole('kasir')}>
            <Text style={[styles.roleText, role === 'kasir' ? styles.roleTextActive : null]}>
              {t('settings.users.roleKasir')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.roleChip, role === 'admin' ? styles.roleChipActive : null]}
            onPress={() => setRole('admin')}>
            <Text style={[styles.roleText, role === 'admin' ? styles.roleTextActive : null]}>
              {t('settings.users.roleAdmin')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('settings.users.activeLabel')}</Text>
          <Switch
            trackColor={{ false: colors.black[600], true: colors.orange[500] }}
            thumbColor={colors.white[50]}
            value={isActive}
            onValueChange={setIsActive}
          />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={saving}
          style={[styles.primaryButton, saving ? styles.buttonDisabled : null]}
          onPress={handleSave}>
          <Text style={styles.primaryButtonText}>
            {saving ? '…' : t('settings.users.saveAction')}
          </Text>
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.sm,
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
  hint: {
    ...typography.caption,
    color: colors.white[150],
  },
  hintSmall: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  roleChip: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  roleChipActive: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  roleText: {
    ...typography.body,
    color: colors.white[300],
    fontWeight: '600',
  },
  roleTextActive: {
    color: colors.white[50],
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  switchLabel: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.card,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    ...typography.heading,
    color: colors.white[50],
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loading: {
    alignItems: 'center',
    backgroundColor: colors.black[900],
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
