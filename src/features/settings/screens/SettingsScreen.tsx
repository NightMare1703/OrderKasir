import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../../theme';
import type { SettingsStackParamList } from '../../../app/navigation';

type ItemProps = {
  title: string;
  subtitle: string;
  onPress: () => void;
};

const SettingsItem = ({ title, subtitle, onPress }: ItemProps) => (
  <TouchableOpacity onPress={onPress} style={styles.item}>
    <View style={styles.itemText}>
      <Text style={styles.itemTitle}>{title}</Text>
      <Text style={styles.itemSubtitle}>{subtitle}</Text>
    </View>
    <Text style={styles.itemChevron}>›</Text>
  </TouchableOpacity>
);

export const SettingsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('settings.groupStore')}</Text>
        <View style={styles.groupCard}>
          <SettingsItem
            subtitle={t('settings.storeSubtitle')}
            title={t('settings.storeTitle')}
            onPress={() => {}}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('settings.groupHardware')}</Text>
        <View style={styles.groupCard}>
          <SettingsItem
            subtitle={t('settings.printer.subtitle')}
            title={t('settings.printer.title')}
            onPress={() => navigation.navigate('PrinterSettings')}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('settings.groupApp')}</Text>
        <View style={styles.groupCard}>
          <SettingsItem
            subtitle={t('settings.languageSubtitle')}
            title={t('settings.languageTitle')}
            onPress={() => {}}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('settings.groupData')}</Text>
        <View style={styles.groupCard}>
          <SettingsItem
            subtitle={t('settings.backupSubtitle')}
            title={t('settings.backupTitle')}
            onPress={() => {}}
          />
        </View>
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
  group: {
    marginBottom: spacing.xl,
  },
  groupLabel: {
    ...typography.micro,
    color: colors.white[150],
    letterSpacing: 1,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  groupCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  itemText: {
    flex: 1,
    marginRight: spacing.md,
  },
  itemTitle: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  itemSubtitle: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: 2,
  },
  itemChevron: {
    ...typography.title,
    color: colors.white[150],
  },
});
