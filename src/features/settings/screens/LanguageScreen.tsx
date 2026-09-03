import { useNavigation } from '@react-navigation/native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import { SettingsService, type SupportedLanguage } from '../../../services/SettingsService';
import { colors, radius, spacing, typography } from '../../../theme';

export const LanguageScreen = (): React.JSX.Element => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const service = React.useMemo(() => new SettingsService(database), []);
  const [selected, setSelected] = React.useState<SupportedLanguage>(
    (i18n.language as SupportedLanguage) ?? 'id',
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    navigation.setOptions({ title: t('settings.languagePage.title') } as never);
  }, [navigation, t]);

  React.useEffect(() => {
    service.getLanguage().then((lang) => setSelected(lang));
  }, [service]);

  const handleSelect = React.useCallback(
    async (lang: SupportedLanguage) => {
      setSelected(lang);
      setSaving(true);
      try {
        const res = await service.setLanguage(lang);
        if (res.status === 'ok') {
          Alert.alert(t('settings.languagePage.saveSuccess'));
        } else {
          Alert.alert(t('settings.languagePage.saveFailed'));
        }
      } catch {
        Alert.alert(t('settings.languagePage.saveFailed'));
      } finally {
        setSaving(false);
      }
    },
    [service, t],
  );

  const options: { value: SupportedLanguage; labelKey: string }[] = [
    { value: 'id', labelKey: 'settings.languagePage.idLabel' },
    { value: 'en', labelKey: 'settings.languagePage.enLabel' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.hint}>{t('settings.languagePage.hint')}</Text>
        {options.map((opt) => {
          const active = selected === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              accessibilityRole="button"
              disabled={saving}
              style={[styles.option, active ? styles.optionActive : null]}
              onPress={() => handleSelect(opt.value)}>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, active ? styles.optionLabelActive : null]}>
                  {t(opt.labelKey)}
                </Text>
                <Text style={styles.optionValue}>{opt.value.toUpperCase()}</Text>
              </View>
              <View style={[styles.radio, active ? styles.radioActive : null]}>
                {active ? <View style={styles.radioDot} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
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
    gap: spacing.md,
    padding: spacing.lg,
  },
  hint: {
    ...typography.caption,
    color: colors.white[150],
    marginBottom: spacing.sm,
  },
  option: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  optionActive: {
    borderColor: colors.orange[500],
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  optionLabelActive: {
    color: colors.white[50],
  },
  optionValue: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: 2,
  },
  radio: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: 999,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  radioActive: {
    borderColor: colors.orange[500],
  },
  radioDot: {
    backgroundColor: colors.orange[500],
    borderRadius: 999,
    height: 12,
    width: 12,
  },
});
