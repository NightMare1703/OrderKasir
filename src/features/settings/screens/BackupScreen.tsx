import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Share } from 'react-native';

import { database } from '../../../database';
import { BackupService, type BackupPreview } from '../../../services/BackupService';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDate = (epoch: number): string => {
  const d = new Date(epoch);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const BackupScreen = (): React.JSX.Element => {
  const { t } = useTranslation();
  const service = React.useMemo(() => new BackupService(database), []);

  const [deviceLabel, setDeviceLabel] = React.useState('');
  const [encrypt, setEncrypt] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [exporting, setExporting] = React.useState(false);

  const [fileContent, setFileContent] = React.useState('');
  const [importPassword, setImportPassword] = React.useState('');
  const [preview, setPreview] = React.useState<BackupPreview | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);

  const handleExport = React.useCallback(async () => {
    if (encrypt && password.trim().length < 4) {
      Alert.alert(t('settings.backup.passwordRequired'));
      return;
    }
    setExporting(true);
    try {
      const json = await service.exportBackup({
        deviceLabel: deviceLabel.trim() || undefined,
        password: encrypt ? password.trim() : undefined,
      });
      await Share.share({ message: json, title: t('settings.backup.shareTitle') });
    } catch {
      Alert.alert(t('settings.backup.exportFailed'));
    } finally {
      setExporting(false);
    }
  }, [deviceLabel, encrypt, password, service, t]);

  const handlePreview = React.useCallback(async () => {
    const trimmed = fileContent.trim();
    if (trimmed === '') {
      setPreviewError(t('settings.backup.previewFailed'));
      return;
    }
    setPreviewError(null);
    setPreview(null);
    const res = await service.previewBackup(trimmed, importPassword.trim() || undefined);
    if (res.status === 'ok') {
      setPreview(res.preview);
      return;
    }
    if (res.status === 'password_required') {
      setPreviewError(t('settings.backup.passwordRequiredImport'));
      return;
    }
    if (res.status === 'decrypt_failed') {
      setPreviewError(t('settings.backup.decryptFailed'));
      return;
    }
    setPreviewError(t('settings.backup.previewFailed'));
  }, [fileContent, importPassword, service, t]);

  const handleRestore = React.useCallback(async () => {
    if (!preview) {
      Alert.alert(t('settings.backup.confirmRequired'));
      return;
    }
    if (!confirmed) {
      Alert.alert(t('settings.backup.confirmRequired'));
      return;
    }
    const trimmed = fileContent.trim();
    setRestoring(true);
    try {
      const res = await service.importBackup(trimmed, {
        confirmed: true,
        password: importPassword.trim() || undefined,
      });
      if (res.status === 'ok') {
        Alert.alert(t('settings.backup.restoreSuccess'));
        setFileContent('');
        setPreview(null);
        setConfirmed(false);
      } else if (res.status === 'password_required') {
        Alert.alert(t('settings.backup.passwordRequiredImport'));
      } else if (res.status === 'decrypt_failed') {
        Alert.alert(t('settings.backup.decryptFailed'));
      } else if (res.status === 'confirmation_required') {
        Alert.alert(t('settings.backup.confirmRequired'));
      } else {
        Alert.alert(t('settings.backup.restoreFailed'));
      }
    } catch {
      Alert.alert(t('settings.backup.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  }, [confirmed, fileContent, importPassword, preview, service, t]);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('settings.backup.exportSectionTitle')}</Text>
        <Text style={styles.hint}>{t('settings.backup.exportHint')}</Text>

        <Text style={styles.label}>{t('settings.backup.deviceLabel')}</Text>
        <TextInput
          placeholder={t('settings.backup.devicePlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={styles.input}
          value={deviceLabel}
          onChangeText={setDeviceLabel}
        />

        <View style={styles.row}>
          <Text style={styles.labelFlex}>{t('settings.backup.encryptLabel')}</Text>
          <Switch
            trackColor={{ false: colors.black[600], true: colors.orange[500] }}
            thumbColor={colors.white[50]}
            value={encrypt}
            onValueChange={setEncrypt}
          />
        </View>

        {encrypt ? (
          <>
            <Text style={styles.label}>{t('settings.backup.passwordLabel')}</Text>
            <TextInput
              placeholder={t('settings.backup.passwordPlaceholder')}
              placeholderTextColor={colors.white[150]}
              secureTextEntry
              style={styles.input}
              value={password}
              onChangeText={setPassword}
            />
          </>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          disabled={exporting}
          style={[styles.primaryButton, exporting ? styles.buttonDisabled : null]}
          onPress={handleExport}>
          <Text style={styles.primaryButtonText}>
            {exporting ? '…' : t('settings.backup.exportAction')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('settings.backup.importSectionTitle')}</Text>
        <Text style={styles.hint}>{t('settings.backup.importHint')}</Text>

        <Text style={styles.label}>{t('settings.backup.fileInputLabel')}</Text>
        <TextInput
          multiline
          numberOfLines={6}
          placeholder={t('settings.backup.filePlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={[styles.input, styles.multiline]}
          value={fileContent}
          onChangeText={setFileContent}
        />

        <Text style={styles.label}>{t('settings.backup.passwordLabel')}</Text>
        <TextInput
          placeholder={t('settings.backup.passwordPlaceholder')}
          placeholderTextColor={colors.white[150]}
          secureTextEntry
          style={styles.input}
          value={importPassword}
          onChangeText={setImportPassword}
        />

        <TouchableOpacity style={styles.secondaryButton} onPress={handlePreview}>
          <Text style={styles.secondaryButtonText}>{t('settings.backup.previewAction')}</Text>
        </TouchableOpacity>

        {previewError ? <Text style={styles.error}>{previewError}</Text> : null}

        {preview ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{t('settings.backup.previewTitle')}</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>{t('settings.backup.previewDate')}</Text>
              <Text style={styles.previewValue}>{formatDate(preview.createdAt)}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>{t('settings.backup.previewDevice')}</Text>
              <Text style={styles.previewValue}>{preview.deviceLabel}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>{t('settings.backup.previewSize')}</Text>
              <Text style={styles.previewValue}>{formatBytes(preview.sizeBytes)}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>{t('settings.backup.previewEncrypted')}</Text>
              <Text style={styles.previewValue}>
                {preview.encrypted ? t('settings.backup.previewEncryptedYes') : t('settings.backup.previewEncryptedNo')}
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>{t('settings.backup.previewCounts')}</Text>
              <Text style={styles.previewValue}>
                {t('settings.backup.previewTransactions')}: {preview.totalTransactions} ·{' '}
                {t('settings.backup.previewProducts')}: {preview.totalProducts} ·{' '}
                {t('settings.backup.previewCustomers')}: {preview.totalCustomers}
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>{t('settings.backup.previewRange')}</Text>
              <Text style={styles.previewValue}>
                {preview.transactionDateRange.min === null
                  ? t('settings.backup.previewRangeEmpty')
                  : `${formatDate(preview.transactionDateRange.min)} → ${formatDate(preview.transactionDateRange.max!)}`}
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Total nilai</Text>
              <Text style={styles.previewValue}>{formatRupiah(0)}</Text>
            </View>

            <View style={styles.confirmRow}>
              <Switch
                trackColor={{ false: colors.black[600], true: colors.orange[500] }}
                thumbColor={colors.white[50]}
                value={confirmed}
                onValueChange={setConfirmed}
              />
              <Text style={styles.confirmLabel}>{t('settings.backup.confirmLabel')}</Text>
            </View>

            <TouchableOpacity
              disabled={!confirmed || restoring}
              style={[styles.primaryButton, !confirmed || restoring ? styles.buttonDisabled : null]}
              onPress={handleRestore}>
              <Text style={styles.primaryButtonText}>
                {restoring ? '…' : t('settings.backup.restoreAction')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
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
  hint: {
    ...typography.caption,
    color: colors.white[150],
  },
  label: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.sm,
  },
  labelFlex: {
    ...typography.caption,
    color: colors.white[300],
    flex: 1,
  },
  input: {
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    color: colors.white[50],
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.card,
    minHeight: 48,
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    ...typography.heading,
    color: colors.white[50],
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  error: {
    ...typography.caption,
    color: colors.red[500],
  },
  previewCard: {
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  previewTitle: {
    ...typography.heading,
    color: colors.white[50],
    marginBottom: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  previewLabel: {
    ...typography.caption,
    color: colors.white[150],
    flex: 1,
  },
  previewValue: {
    ...typography.caption,
    color: colors.white[50],
    flex: 1,
    textAlign: 'right',
  },
  confirmRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  confirmLabel: {
    ...typography.caption,
    color: colors.white[300],
    flex: 1,
  },
});
