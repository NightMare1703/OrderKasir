import { useTranslation } from 'react-i18next';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';

type Props = {
  titleKey: string;
};

// Stub layar kosong untuk T0.3; diganti layar sungguhan per task berikutnya.
export const PlaceholderScreen = ({ titleKey }: Props) => {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t(titleKey)}</Text>
      <Text style={styles.hint}>{t('common.comingSoon')}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.black[900],
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  hint: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.white[50],
  },
});
