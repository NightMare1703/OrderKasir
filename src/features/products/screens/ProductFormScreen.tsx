import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as React from 'react';
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

import Category from '../../../database/models/category';
import { database } from '../../../database';
import { ProductService } from '../../../services/ProductService';
import { colors, radius, spacing, typography } from '../../../theme';
import type { ProductsStackParamList } from '../../../app/navigation';
import { PRODUCT_UNITS, type ProductUnitValue } from '../schemas';
import { parseRupiahInput } from '../../../utils/money';
import { BarcodeScannerStubSheet } from '../components/BarcodeScannerStubSheet';

type ProductFormScreenProps = NativeStackScreenProps<ProductsStackParamList, 'ProductForm'>;

type ErrorField =
  | 'name'
  | 'barcode'
  | 'category'
  | 'costPrice'
  | 'sellPrice'
  | 'initialStock'
  | 'minStock'
  | 'form';

type Errors = Partial<Record<ErrorField, string>>;

type FormState = {
  name: string;
  barcode: string;
  categoryId: string | null;
  unit: ProductUnitValue;
  customUnitLabel: string;
  costPrice: string;
  sellPrice: string;
  initialStock: string;
  minStock: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: '',
  barcode: '',
  categoryId: null,
  unit: 'pcs',
  customUnitLabel: '',
  costPrice: '',
  sellPrice: '',
  initialStock: '0',
  minStock: '0',
  isActive: true,
};

const FieldLabel = ({ text }: { text: string }) => (
  <Text style={styles.fieldLabel}>{text}</Text>
);

const FieldError = ({ messageKey }: { messageKey: string }) => {
  const { t } = useTranslation();
  return <Text style={styles.fieldError}>{t(messageKey)}</Text>;
};

const NumberInput = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) => (
  <TextInput
    keyboardType="number-pad"
    onChangeText={onChange}
    style={styles.input}
    value={value}
  />
);

export const ProductFormScreen = ({ route, navigation }: ProductFormScreenProps) => {
  const { t } = useTranslation();

  const productId = route.params?.productId;
  const isEdit = typeof productId === 'string';

  const productService = React.useMemo(() => new ProductService(database), []);

  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Errors>({});
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [creatingCategory, setCreatingCategory] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [scanVisible, setScanVisible] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    navigation.setOptions({
      headerTitle: isEdit ? t('products.formEditTitle') : t('products.formCreateTitle'),
    });
  }, [isEdit, navigation, t]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const categoryRows = await productService.listCategories();
      if (cancelled) {
        return;
      }
      setCategories(categoryRows);

      if (isEdit && typeof productId === 'string') {
        const product = await productService.getById(productId);
        if (cancelled) {
          return;
        }
        if (product === null) {
          navigation.goBack();
          return;
        }
        setForm({
          name: product.name,
          barcode: product.barcode ?? '',
          categoryId: product.categoryId,
          unit: product.unit,
          customUnitLabel: product.customUnitLabel ?? '',
          costPrice: String(product.costPrice),
          sellPrice: String(product.sellPrice),
          initialStock: String(product.stock),
          minStock: String(product.minStock),
          isActive: product.isActive,
        });
      }
    };
    // Muat sekali saat masuk layar; kategori baru dibuat lewat inline form di bawah.
    load();
    return () => {
      cancelled = true;
    };
  }, [isEdit, navigation, productId, productService]);

  const patchForm = React.useCallback((patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const reloadCategories = React.useCallback(async () => {
    setCategories(await productService.listCategories());
  }, [productService]);

  const handleCreateCategory = React.useCallback(async () => {
    const result = await productService.createCategory(newCategoryName);
    if (result.status === 'ok') {
      setNewCategoryName('');
      setCreatingCategory(false);
      await reloadCategories();
      patchForm({ categoryId: result.category.id });
    }
  }, [newCategoryName, patchForm, productService, reloadCategories]);

  const handleSave = React.useCallback(async () => {
    if (busy) {
      return;
    }

    const nextErrors: Errors = {};
    const name = form.name.trim();
    if (name === '') {
      nextErrors.name = 'products.errName';
    }
    const costPrice = parseRupiahInput(form.costPrice);
    if (costPrice === null) {
      nextErrors.costPrice = 'products.errNumber';
    }
    const sellPrice = parseRupiahInput(form.sellPrice);
    if (sellPrice === null) {
      nextErrors.sellPrice = 'products.errNumber';
    }
    const minStock = parseRupiahInput(form.minStock);
    if (minStock === null) {
      nextErrors.minStock = 'products.errNumber';
    }
    // Stok awal hanya saat create — setelah itu perubahan stok hanya via
    // StockService (AGENTS.md §4.2).
    const initialStock = isEdit ? 0 : parseRupiahInput(form.initialStock);
    if (!isEdit && initialStock === null) {
      nextErrors.initialStock = 'products.errNumber';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const base = {
      name,
      barcode: form.barcode.trim(),
      categoryId: form.categoryId,
      unit: form.unit,
      customUnitLabel: form.unit === 'custom' ? form.customUnitLabel.trim() : '',
      costPrice: costPrice as number,
      sellPrice: sellPrice as number,
      minStock: minStock as number,
    };

    setBusy(true);
    try {
      const result = isEdit
        ? await productService.update(productId as string, { ...base, isActive: form.isActive })
        : await productService.create({ ...base, stock: initialStock as number });

      switch (result.status) {
        case 'ok':
          if (result.warnings.length > 0) {
            Alert.alert(
              t('products.warningTitle'),
              t('products.warningSellBelowCost'),
              [{ onPress: () => navigation.goBack(), text: t('common.ok') }],
              { cancelable: false },
            );
          } else {
            navigation.goBack();
          }
          break;
        case 'validation_failed':
          setErrors({ form: 'products.errGeneric' });
          break;
        case 'barcode_duplicate':
          setErrors({ barcode: 'products.errBarcodeDuplicate' });
          break;
        case 'category_not_found':
          setErrors({ category: 'products.errGeneric' });
          break;
        case 'not_found':
          navigation.goBack();
          break;
      }
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    form,
    isEdit,
    navigation,
    productId,
    productService,
    t,
  ]);

  const handleDelete = React.useCallback(() => {
    if (typeof productId !== 'string') {
      return;
    }
    Alert.alert(
      t('products.deleteConfirmTitle'),
      t('products.deleteConfirmBody', { name: form.name }),
      [
        { style: 'cancel', text: t('common.cancel') },
        {
          onPress: () => {
            productService.softDelete(productId).then(() => navigation.goBack());
          },
          style: 'destructive',
          text: t('common.delete'),
        },
      ],
    );
  }, [form.name, navigation, productId, productService, t]);

  const renderUnitChip = (unit: ProductUnitValue) => {
    const selected = form.unit === unit;
    return (
      <TouchableOpacity
        key={unit}
        onPress={() => patchForm({ unit })}
        style={[styles.chip, selected && styles.chipSelected]}>
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
          {t(`products.unit_${unit}`)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <FieldLabel text={t('products.fieldName')} />
      <TextInput
        onChangeText={(name) => patchForm({ name })}
        style={styles.input}
        value={form.name}
      />
      {errors.name ? <FieldError messageKey={errors.name} /> : null}

      <FieldLabel text={t('products.fieldBarcode')} />
      <View style={styles.barcodeRow}>
        <TextInput
          keyboardType="number-pad"
          onChangeText={(barcode) => patchForm({ barcode })}
          style={[styles.input, styles.barcodeInput]}
          value={form.barcode}
        />
        <TouchableOpacity
          onPress={() => setScanVisible(true)}
          style={styles.scanButton}>
          <Text style={styles.scanButtonText}>{t('products.scan')}</Text>
        </TouchableOpacity>
      </View>
      {errors.barcode ? <FieldError messageKey={errors.barcode} /> : null}

      <FieldLabel text={t('products.fieldCategory')} />
      <View style={styles.chipWrap}>
        <TouchableOpacity
          onPress={() => patchForm({ categoryId: null })}
          style={[styles.chip, form.categoryId === null && styles.chipSelected]}>
          <Text style={[styles.chipText, form.categoryId === null && styles.chipTextSelected]}>
            {t('products.noCategory')}
          </Text>
        </TouchableOpacity>
        {categories.map((category) => {
          const selected = form.categoryId === category.id;
          return (
            <TouchableOpacity
              key={category.id}
              onPress={() => patchForm({ categoryId: category.id })}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {category.name}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => setCreatingCategory((current) => !current)}
          style={[styles.chip, creatingCategory && styles.chipSelected]}>
          <Text style={[styles.chipText, creatingCategory && styles.chipTextSelected]}>
            {t('products.createCategory')}
          </Text>
        </TouchableOpacity>
      </View>
      {creatingCategory ? (
        <View style={styles.newCategoryRow}>
          <TextInput
            autoFocus
            onChangeText={setNewCategoryName}
            placeholder={t('products.newCategoryPlaceholder')}
            placeholderTextColor={colors.white[150]}
            style={[styles.input, styles.newCategoryInput]}
            value={newCategoryName}
          />
          <TouchableOpacity
            disabled={newCategoryName.trim() === ''}
            onPress={handleCreateCategory}
            style={[
              styles.newCategoryButton,
              newCategoryName.trim() === '' && styles.buttonDisabled,
            ]}>
            <Text style={styles.newCategoryButtonText}>{t('products.addCategory')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {errors.category ? <FieldError messageKey={errors.category} /> : null}

      <FieldLabel text={t('products.fieldUnit')} />
      <View style={styles.chipWrap}>{PRODUCT_UNITS.map(renderUnitChip)}</View>
      {form.unit === 'custom' ? (
        <>
          <TextInput
            onChangeText={(customUnitLabel) => patchForm({ customUnitLabel })}
            placeholder={t('products.customUnitPlaceholder')}
            placeholderTextColor={colors.white[150]}
            style={[styles.input, styles.stackTop]}
            value={form.customUnitLabel}
          />
          <Text style={styles.hint}>{t('products.customUnitHint')}</Text>
        </>
      ) : null}

      <FieldLabel text={t('products.fieldHpp')} />
      <NumberInput onChange={(costPrice) => patchForm({ costPrice })} value={form.costPrice} />
      {errors.costPrice ? <FieldError messageKey={errors.costPrice} /> : null}

      <FieldLabel text={t('products.fieldSellPrice')} />
      <NumberInput onChange={(sellPrice) => patchForm({ sellPrice })} value={form.sellPrice} />
      {errors.sellPrice ? <FieldError messageKey={errors.sellPrice} /> : null}

      {!isEdit ? (
        <>
          <FieldLabel text={t('products.fieldInitialStock')} />
          <NumberInput
            onChange={(initialStock) => patchForm({ initialStock })}
            value={form.initialStock}
          />
          {errors.initialStock ? <FieldError messageKey={errors.initialStock} /> : null}
        </>
      ) : null}

      <FieldLabel text={t('products.fieldMinStock')} />
      <NumberInput onChange={(minStock) => patchForm({ minStock })} value={form.minStock} />
      {errors.minStock ? <FieldError messageKey={errors.minStock} /> : null}

      {isEdit ? (
        <View style={styles.activeRow}>
          <Text style={styles.activeLabel}>{t('products.fieldActive')}</Text>
          <Switch
            onValueChange={(isActive) => patchForm({ isActive })}
            trackColor={{ false: colors.black[500], true: colors.orange[500] }}
            value={form.isActive}
          />
        </View>
      ) : null}

      {errors.form ? (
        <Text style={[styles.fieldError, styles.stackTop]}>{t(errors.form)}</Text>
      ) : null}

      <TouchableOpacity
        disabled={busy}
        onPress={handleSave}
        style={[styles.saveButton, busy && styles.buttonDisabled]}>
        <Text style={styles.saveButtonText}>{t('common.save')}</Text>
      </TouchableOpacity>

      {isEdit ? (
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
        </TouchableOpacity>
      ) : null}

      <BarcodeScannerStubSheet
        visible={scanVisible}
        onCancel={() => setScanVisible(false)}
        onSubmit={(barcode) => {
          setScanVisible(false);
          patchForm({ barcode });
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  activeLabel: {
    ...typography.heading,
    color: colors.white[50],
  },
  activeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  barcodeInput: {
    flex: 1,
  },
  barcodeRow: {
    flexDirection: 'row',
  },
  buttonDisabled: {
    backgroundColor: colors.black[500],
  },
  chip: {
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    marginRight: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  chipSelected: {
    borderColor: colors.orange[500],
  },
  chipText: {
    ...typography.caption,
    color: colors.white[300],
  },
  chipTextSelected: {
    color: colors.white[50],
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  container: {
    backgroundColor: colors.black[900],
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  deleteButton: {
    alignItems: 'center',
    borderColor: colors.red[500],
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.md,
  },
  deleteButtonText: {
    ...typography.heading,
    color: colors.red[500],
  },
  fieldError: {
    ...typography.caption,
    color: colors.red[500],
    marginTop: spacing.xs,
  },
  fieldLabel: {
    ...typography.micro,
    color: colors.white[300],
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginTop: spacing.lg,
    textTransform: 'uppercase',
  },
  hint: {
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
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  newCategoryButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.input,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  newCategoryButtonText: {
    ...typography.body,
    color: colors.black[900],
  },
  newCategoryInput: {
    flex: 1,
  },
  newCategoryRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.xl,
  },
  saveButtonText: {
    ...typography.heading,
    color: colors.black[900],
  },
  scanButton: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.input,
    borderWidth: 1,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  scanButtonText: {
    ...typography.body,
    color: colors.white[300],
  },
  stackTop: {
    marginTop: spacing.sm,
  },
});
