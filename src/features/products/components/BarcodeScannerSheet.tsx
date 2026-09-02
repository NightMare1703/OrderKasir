import { useTranslation } from 'react-i18next';
import * as React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors, radius, spacing, typography } from '../../../theme';
import { MockScannerAdapter } from '../../../hardware/scanner/mockScannerAdapter';
import type { ScannerAdapter } from '../../../hardware/scanner/adapter';
import { normalizeBarcode } from '../../../hardware/scanner/barcode';

type Props = {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (barcode: string) => void;
  scannerAdapter?: ScannerAdapter;
};

export const BarcodeScannerSheet = ({ visible, onCancel, onSubmit, scannerAdapter }: Props) => {
  const { t } = useTranslation();
  const [barcode, setBarcode] = React.useState('');
  const [scanning, setScanning] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);

  const adapter = React.useMemo(
    () => scannerAdapter ?? new MockScannerAdapter(),
    [scannerAdapter],
  );

  React.useEffect(() => {
    if (!visible) {
      setBarcode('');
      setCameraError(null);
      setScanning(false);
    }
  }, [visible]);

  const handleManualSubmit = React.useCallback(() => {
    const trimmed = normalizeBarcode(barcode);
    if (trimmed !== '') {
      onSubmit(trimmed);
    }
  }, [barcode, onSubmit]);

  const handleCameraScan = React.useCallback(async () => {
    if (scanning) {
      return;
    }
    setScanning(true);
    setCameraError(null);
    try {
      const available = await adapter.isCameraAvailable();
      if (!available) {
        setCameraError(t('scanner.cameraUnavailable'));
        return;
      }
      const granted = await adapter.requestCameraPermission();
      if (!granted) {
        setCameraError(t('scanner.permissionDenied'));
        return;
      }
      const result = await adapter.scanOnce();
      if (result && result.value) {
        onSubmit(normalizeBarcode(result.value));
        return;
      }
      const fallback = normalizeBarcode(barcode);
      if (fallback !== '') {
        onSubmit(fallback);
        return;
      }
      setCameraError(t('scanner.noResult'));
    } catch {
      setCameraError(t('scanner.scanFailed'));
    } finally {
      setScanning(false);
    }
  }, [adapter, barcode, onSubmit, scanning, t]);

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.scrim} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('products.scanTitle')}</Text>
          <Text style={styles.body}>{t('scanner.sheetBody')}</Text>
          <Text style={styles.supportHint}>{t('scanner.supportedFormats')}</Text>

          <View style={styles.cameraPreviewPlaceholder}>
            <Text style={styles.cameraPreviewText}>{t('scanner.cameraPreviewPlaceholder')}</Text>
            <TouchableOpacity
              disabled={scanning}
              onPress={handleCameraScan}
              style={[styles.cameraButton, scanning && styles.buttonDisabled]}>
              <Text style={styles.cameraButtonText}>
                {scanning ? t('scanner.scanning') : t('scanner.scanViaCamera')}
              </Text>
            </TouchableOpacity>
            {cameraError ? <Text style={styles.cameraError}>{cameraError}</Text> : null}
          </View>

          <Text style={styles.divider}>{t('scanner.orManual')}</Text>

          <TextInput
            autoFocus
            keyboardType="default"
            onChangeText={setBarcode}
            onSubmitEditing={handleManualSubmit}
            placeholder={t('products.scanPlaceholder')}
            placeholderTextColor={colors.white[150]}
            returnKeyType="search"
            style={styles.input}
            value={barcode}
          />
          <Text style={styles.wedgeHint}>{t('scanner.wedgeHint')}</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity onPress={onCancel} style={[styles.button, styles.ghostButton]}>
              <Text style={styles.ghostButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={normalizeBarcode(barcode) === ''}
              onPress={handleManualSubmit}
              style={[
                styles.button,
                styles.primaryButton,
                normalizeBarcode(barcode) === '' && styles.primaryButtonDisabled,
              ]}>
              <Text style={styles.primaryButtonText}>{t('products.scanSubmit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  body: {
    ...typography.caption,
    color: colors.white[300],
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.button,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cameraButton: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.orange[500],
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  cameraButtonText: {
    ...typography.heading,
    color: colors.orange[500],
    fontSize: 14,
  },
  cameraError: {
    ...typography.caption,
    color: colors.red[500],
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  cameraPreviewPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.black[900],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  cameraPreviewText: {
    ...typography.caption,
    color: colors.white[150],
    textAlign: 'center',
  },
  divider: {
    ...typography.micro,
    color: colors.white[150],
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderColor: colors.black[600],
    borderWidth: 1,
  },
  ghostButtonText: {
    ...typography.heading,
    color: colors.white[300],
  },
  input: {
    ...typography.body,
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.white[50],
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  primaryButton: {
    backgroundColor: colors.orange[500],
  },
  primaryButtonDisabled: {
    backgroundColor: colors.black[500],
  },
  primaryButtonText: {
    ...typography.heading,
    color: colors.black[900],
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
    padding: spacing.xl,
  },
  supportHint: {
    ...typography.caption,
    color: colors.white[150],
    fontSize: 11,
    marginTop: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.white[50],
  },
  wedgeHint: {
    ...typography.caption,
    color: colors.white[150],
    fontSize: 11,
    marginTop: spacing.xs,
  },
});
