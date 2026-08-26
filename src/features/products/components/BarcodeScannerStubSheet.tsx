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

type Props = {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (barcode: string) => void;
};

// Stub scanner (T1.3): kamera scanner sungguhan menyusul di T2.6 lewat
// adapter src/hardware/scanner. Untuk sekarang barcode diisi manual.
export const BarcodeScannerStubSheet = ({ visible, onCancel, onSubmit }: Props) => {
  const { t } = useTranslation();
  const [barcode, setBarcode] = React.useState('');

  React.useEffect(() => {
    if (!visible) {
      setBarcode('');
    }
  }, [visible]);

  const submit = React.useCallback(() => {
    const trimmed = barcode.trim();
    if (trimmed !== '') {
      onSubmit(trimmed);
    }
  }, [barcode, onSubmit]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.scrim} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('products.scanTitle')}</Text>
          <Text style={styles.body}>{t('products.scanStubBody')}</Text>
          <TextInput
            autoFocus
            keyboardType="number-pad"
            onChangeText={setBarcode}
            placeholder={t('products.scanPlaceholder')}
            placeholderTextColor={colors.white[150]}
            style={styles.input}
            value={barcode}
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity onPress={onCancel} style={[styles.button, styles.ghostButton]}>
              <Text style={styles.ghostButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={barcode.trim() === ''}
              onPress={submit}
              style={[
                styles.button,
                styles.primaryButton,
                barcode.trim() === '' && styles.primaryButtonDisabled,
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
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.button,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.black[600],
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
    marginBottom: spacing.xl,
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
  title: {
    ...typography.title,
    color: colors.white[50],
  },
});
