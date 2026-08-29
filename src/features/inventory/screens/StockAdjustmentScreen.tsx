import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { database } from '../../../database';
import type Product from '../../../database/models/product';
import { ProductService } from '../../../services/ProductService';
import { StockService } from '../../../services/StockService';
import { colors, radius, spacing, typography } from '../../../theme';
import { useSessionStore } from '../../auth/sessionStore';
import type { ProductsStackParamList } from '../../../app/navigation';

type Props = NativeStackScreenProps<ProductsStackParamList, 'StockAdjustment'>;

type Direction = 'add' | 'remove';

const REASON_PRESETS = [
  'rusak',
  'hilang',
  'opname',
  'kadaluarsa',
  'lainnya',
] as const;

type ReasonPreset = (typeof REASON_PRESETS)[number];

const reasonPresetToI18nKey: Record<ReasonPreset, string> = {
  rusak: 'inventory.adjustment.reasonPresetRusak',
  hilang: 'inventory.adjustment.reasonPresetHilang',
  opname: 'inventory.adjustment.reasonPresetOpname',
  kadaluarsa: 'inventory.adjustment.reasonPresetKadaluarsa',
  lainnya: 'inventory.adjustment.reasonPresetLainnya',
};

const parsePositiveInt = (raw: string): number | null => {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return null;
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export const StockAdjustmentScreen = ({ route, navigation }: Props) => {
  const { t } = useTranslation();
  const productId = route.params.productId;

  const productService = React.useMemo(() => new ProductService(database), []);
  const stockService = React.useMemo(() => new StockService(database), []);

  const [product, setProduct] = React.useState<Product | null>(null);
  const [direction, setDirection] = React.useState<Direction>('add');
  const [qtyRaw, setQtyRaw] = React.useState('');
  const [preset, setPreset] = React.useState<ReasonPreset>('rusak');
  const [customReason, setCustomReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [qtyError, setQtyError] = React.useState<string | null>(null);
  const [reasonError, setReasonError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const row = await productService.getById(productId);
      if (!cancelled) {
        if (row === null) {
          navigation.goBack();
          return;
        }
        setProduct(row);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [navigation, productId, productService]);

  React.useEffect(() => {
    navigation.setOptions({ headerTitle: t('inventory.adjustment.title') });
  }, [navigation, t]);

  const parsedQty = React.useMemo(() => parsePositiveInt(qtyRaw), [qtyRaw]);

  const effectiveReason = React.useMemo(() => {
    if (preset === 'lainnya') return customReason.trim();
    // preset label already meaningful; use i18n display but store preset word for audit
    // Simpan alasan sebagai label Bahasa Indonesia yang dipilih.
    if (preset === 'rusak') return 'Barang rusak';
    if (preset === 'hilang') return 'Barang hilang';
    if (preset === 'opname') return 'Opname stok';
    if (preset === 'kadaluarsa') return 'Kadaluarsa';
    return '';
  }, [preset, customReason]);

  const previewBefore = product?.stock ?? 0;
  const previewAfter = React.useMemo(() => {
    if (parsedQty === null || product === null) return null;
    const delta = direction === 'add' ? parsedQty : -parsedQty;
    return previewBefore + delta;
  }, [parsedQty, direction, previewBefore, product]);

  const handleSave = React.useCallback(async () => {
    setQtyError(null);
    setReasonError(null);

    if (parsedQty === null) {
      setQtyError(t('inventory.adjustment.qtyRequired'));
      return;
    }
    const reason = effectiveReason;
    if (reason === '') {
      setReasonError(t('inventory.adjustment.reasonRequired'));
      return;
    }
    if (product === null) return;

    const currentUserId = useSessionStore.getState().currentUserId;
    if (currentUserId === null) {
      Alert.alert(t('inventory.adjustment.genericFailed'));
      return;
    }

    const signedQty = direction === 'add' ? parsedQty : -parsedQty;

    setBusy(true);
    try {
      const result = await stockService.adjust({
        productId: product.id,
        type: 'adjustment',
        qty: signedQty,
        reason,
        userId: currentUserId,
        refType: 'adjustment',
        refId: null,
      });

      if (result.status === 'ok') {
        Alert.alert(t('inventory.adjustment.success'), undefined, [
          { text: t('common.ok'), onPress: () => navigation.goBack() },
        ]);
        return;
      }
      if (result.status === 'reason_required') {
        setReasonError(t('inventory.adjustment.reasonRequired'));
        return;
      }
      if (result.status === 'negative_stock') {
        Alert.alert(t('inventory.adjustment.negativeBlocked'));
        return;
      }
      if (result.status === 'invalid_qty') {
        setQtyError(t('inventory.adjustment.qtyRequired'));
        return;
      }
      Alert.alert(t('inventory.adjustment.genericFailed'));
    } finally {
      setBusy(false);
    }
  }, [direction, effectiveReason, navigation, parsedQty, product, stockService, t]);

  if (product === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>{t('common.ok')}</Text>
      </View>
    );
  }

  const unitLabel =
    product.unit === 'custom' && product.customUnitLabel
      ? product.customUnitLabel
      : product.unit;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}>
      <Text style={styles.fieldLabel}>{t('inventory.adjustment.product')}</Text>
      <View style={styles.productCard}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productMeta}>
          {t('inventory.stockLabel')} {previewBefore} · {unitLabel} · {t('inventory.minStockLabel')} {product.minStock}
        </Text>
      </View>

      <Text style={styles.fieldLabel}>{t('inventory.adjustment.currentStock')}</Text>
      <View style={styles.stockRow}>
        <Text style={styles.stockValue}>{previewBefore}</Text>
        <Text style={styles.stockUnit}>{unitLabel}</Text>
      </View>

      <Text style={styles.fieldLabel}>{t('inventory.adjustment.direction')}</Text>
      <View style={styles.chipWrap}>
        <TouchableOpacity
          onPress={() => setDirection('add')}
          style={[styles.chip, direction === 'add' && styles.chipSelected]}>
          <Text style={[styles.chipText, direction === 'add' && styles.chipTextSelected]}>
            {t('inventory.adjustment.directionAdd')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setDirection('remove')}
          style={[styles.chip, direction === 'remove' && styles.chipSelected]}>
          <Text style={[styles.chipText, direction === 'remove' && styles.chipTextSelected]}>
            {t('inventory.adjustment.directionRemove')}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.fieldLabel}>{t('inventory.adjustment.qtyLabel')}</Text>
      <TextInput
        keyboardType="number-pad"
        onChangeText={setQtyRaw}
        placeholder={t('inventory.adjustment.qtyPlaceholder')}
        placeholderTextColor={colors.white[150]}
        style={styles.input}
        value={qtyRaw}
      />
      {qtyError ? <Text style={styles.fieldError}>{qtyError}</Text> : null}

      <Text style={styles.fieldLabel}>{t('inventory.adjustment.reasonLabel')}</Text>
      <View style={styles.chipWrap}>
        {REASON_PRESETS.map((key) => {
          const selected = preset === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setPreset(key)}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {t(reasonPresetToI18nKey[key])}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {preset === 'lainnya' ? (
        <TextInput
          onChangeText={setCustomReason}
          placeholder={t('inventory.adjustment.reasonPlaceholder')}
          placeholderTextColor={colors.white[150]}
          style={[styles.input, styles.stackTop]}
          value={customReason}
        />
      ) : null}
      {reasonError ? <Text style={styles.fieldError}>{reasonError}</Text> : null}

      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>{t('inventory.adjustment.preview')}</Text>
        <View style={styles.previewRow}>
          <View style={styles.previewCol}>
            <Text style={styles.previewLabel}>{t('inventory.adjustment.stockBefore')}</Text>
            <Text style={styles.previewValue}>{previewBefore}</Text>
          </View>
          <Text style={styles.previewArrow}>→</Text>
          <View style={styles.previewCol}>
            <Text style={styles.previewLabel}>{t('inventory.adjustment.stockAfter')}</Text>
            <Text
              style={[
                styles.previewValue,
                previewAfter !== null && previewAfter < 0 && styles.previewNegative,
              ]}>
              {previewAfter === null ? '—' : previewAfter}
            </Text>
          </View>
        </View>
        {previewAfter !== null && previewAfter < 0 ? (
          <Text style={styles.previewWarning}>{t('inventory.adjustment.negativeBlocked')}</Text>
        ) : null}
      </View>

      <TouchableOpacity
        disabled={busy}
        onPress={handleSave}
        style={[styles.saveButton, busy && styles.buttonDisabled]}>
        <Text style={styles.saveButtonText}>{t('inventory.adjustment.save')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  container: {
    backgroundColor: colors.black[900],
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.white[300],
  },
  fieldLabel: {
    ...typography.micro,
    color: colors.white[300],
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginTop: spacing.lg,
    textTransform: 'uppercase',
  },
  productCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
  },
  productName: {
    ...typography.heading,
    color: colors.white[50],
  },
  productMeta: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
  },
  stockRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stockValue: {
    ...typography.display,
    color: colors.white[50],
    fontSize: 28,
  },
  stockUnit: {
    ...typography.body,
    color: colors.white[300],
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  chipText: {
    ...typography.caption,
    color: colors.white[300],
  },
  chipTextSelected: {
    color: colors.black[900],
    fontWeight: '600',
  },
  input: {
    ...typography.body,
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.white[50],
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  fieldError: {
    ...typography.caption,
    color: colors.red[500],
    marginTop: spacing.xs,
  },
  stackTop: {
    marginTop: spacing.sm,
  },
  previewCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  previewTitle: {
    ...typography.micro,
    color: colors.white[150],
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  previewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  previewCol: {
    alignItems: 'center',
    flex: 1,
  },
  previewLabel: {
    ...typography.caption,
    color: colors.white[150],
  },
  previewValue: {
    ...typography.title,
    color: colors.white[50],
    marginTop: spacing.xs,
  },
  previewNegative: {
    color: colors.red[500],
  },
  previewArrow: {
    ...typography.title,
    color: colors.white[150],
    marginHorizontal: spacing.lg,
  },
  previewWarning: {
    ...typography.caption,
    color: colors.red[500],
    marginTop: spacing.md,
    textAlign: 'center',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.xl,
  },
  buttonDisabled: {
    backgroundColor: colors.black[500],
  },
  saveButtonText: {
    ...typography.heading,
    color: colors.black[900],
  },
});
