import { useNavigation } from '@react-navigation/native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import { SettingsService } from '../../../services/SettingsService';
import { colors, radius, spacing, typography } from '../../../theme';

export const StoreProfileScreen = (): React.JSX.Element => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const service = React.useMemo(() => new SettingsService(database), []);

  const [storeName, setStoreName] = React.useState('');
  const [storeAddress, setStoreAddress] = React.useState('');
  const [receiptFooter, setReceiptFooter] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const profile = await service.getStoreProfile();
      setStoreName(profile.storeName ?? '');
      setStoreAddress(profile.storeAddress ?? '');
      setReceiptFooter(profile.receiptFooter ?? '');
    } finally {
      setLoading(false);
    }
  }, [service]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    navigation.setOptions({ title: t('settings.storeProfile.title') } as never);
  }, [navigation, t]);

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    try {
      const res = await service.updateStoreProfile({
        storeName: storeName.trim() === '' ? null : storeName,
        storeAddress: storeAddress.trim() === '' ? null : storeAddress,
        receiptFooter: receiptFooter.trim() === '' ? null : receiptFooter,
      });
      if (res.status === 'ok') {
        Alert.alert(t('settings.storeProfile.saveSuccess'));
      } else if (res.status === 'invalid_store_name') {
        Alert.alert(t('settings.storeProfile.nameTooLong'));
      } else if (res.status === 'invalid_store_address') {
        Alert.alert(t('settings.storeProfile.addressTooLong'));
      } else if (res.status === 'invalid_receipt_footer') {
        Alert.alert(t('settings.storeProfile.footerTooLong'));
      }
    } catch {
      Alert.alert(t('settings.storeProfile.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [receiptFooter, service, storeAddress, storeName, t]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.hint}>{t('common.ok')}…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.hint}>{t('settings.storeProfile.hint')}</Text>

        <Text style={styles.label}>{t('settings.storeProfile.nameLabel')}</Text>
        <TextInput
          maxLength={100}
          placeholder={t('settings.storeProfile.namePlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={styles.input}
          value={storeName}
          onChangeText={setStoreName}
        />
        <Text style={styles.counter}>{storeName.length}/100</Text>

        <Text style={styles.label}>{t('settings.storeProfile.addressLabel')}</Text>
        <TextInput
          multiline
          maxLength={200}
          numberOfLines={3}
          placeholder={t('settings.storeProfile.addressPlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={[styles.input, styles.multiline]}
          value={storeAddress}
          onChangeText={setStoreAddress}
        />
        <Text style={styles.counter}>{storeAddress.length}/200</Text>

        <Text style={styles.label}>{t('settings.storeProfile.footerLabel')}</Text>
        <TextInput
          multiline
          maxLength={200}
          numberOfLines={2}
          placeholder={t('settings.storeProfile.footerPlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={[styles.input, styles.multiline]}
          value={receiptFooter}
          onChangeText={setReceiptFooter}
        />
        <Text style={styles.counter}>{receiptFooter.length}/200</Text>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={saving}
          style={[styles.primaryButton, saving ? styles.buttonDisabled : null]}
          onPress={handleSave}>
          <Text style={styles.primaryButtonText}>
            {saving ? '…' : t('settings.storeProfile.saveAction')}
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
  hint: {
    ...typography.caption,
    color: colors.white[150],
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
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  counter: {
    ...typography.caption,
    color: colors.white[150],
    textAlign: 'right',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.card,
    justifyContent: 'center',
    marginTop: spacing.md,
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
