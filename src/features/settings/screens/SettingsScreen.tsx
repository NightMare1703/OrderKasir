import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import type Shift from '../../../database/models/shift';
import { SettingsService } from '../../../services/SettingsService';
import { ShiftService } from '../../../services/ShiftService';
import { UserService } from '../../../services/UserService';
import { useSessionStore } from '../../auth/sessionStore';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';
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
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const shiftService = React.useMemo(() => new ShiftService(database), []);
  const settingsService = React.useMemo(() => new SettingsService(database), []);
  const userService = React.useMemo(() => new UserService(database), []);
  const currentUserId = useSessionStore((s) => s.currentUserId);

  const [activeShift, setActiveShift] = React.useState<Shift | null>(null);
  const [storeName, setStoreName] = React.useState<string | null>(null);
  const [language, setLanguage] = React.useState<string>(i18n.language);
  const [isAdmin, setIsAdmin] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    const active = await shiftService.getActiveShift();
    setActiveShift(active);
    const profile = await settingsService.getStoreProfile();
    setStoreName(profile.storeName);
    const lang = await settingsService.getLanguage();
    setLanguage(lang);
    if (currentUserId) {
      const me = await userService.findUser(currentUserId);
      setIsAdmin(me?.role === 'admin');
    } else {
      setIsAdmin(false);
    }
  }, [currentUserId, settingsService, shiftService, userService]);

  useFocusEffect(
    React.useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleShiftPrimary = React.useCallback(() => {
    if (activeShift) {
      navigation.navigate('CloseShift', { shiftId: activeShift.id });
    } else {
      navigation.navigate('OpenShift');
    }
  }, [activeShift, navigation]);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('shift.title')}</Text>
        <View style={styles.groupCard}>
          <SettingsItem
            subtitle={
              activeShift
                ? `${t('shift.activeLabel')} · ${formatRupiah(activeShift.openingCash)}`
                : t('shift.noActive')
            }
            title={activeShift ? t('shift.closeTitle') : t('shift.openTitle')}
            onPress={handleShiftPrimary}
          />
          <View style={styles.divider} />
          <SettingsItem
            subtitle={t('shift.tapToDetail')}
            title={t('shift.historyTitle')}
            onPress={() => navigation.navigate('ShiftHistory')}
          />
          {activeShift ? (
            <>
              <View style={styles.divider} />
              <SettingsItem
                subtitle={`${t('shift.openedAt')} ${activeShift.openingCash ? formatRupiah(activeShift.openingCash) : ''}`}
                title={t('shift.recapTitle')}
                onPress={() => navigation.navigate('ShiftRecap', { shiftId: activeShift.id })}
              />
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('settings.groupStore')}</Text>
        <View style={styles.groupCard}>
          <SettingsItem
            subtitle={storeName ?? t('settings.storeSubtitle')}
            title={t('settings.storeTitle')}
            onPress={() => navigation.navigate('StoreProfile')}
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
            subtitle={language === 'en' ? 'English' : 'Indonesia'}
            title={t('settings.languageTitle')}
            onPress={() => navigation.navigate('Language')}
          />
          <View style={styles.divider} />
          <SettingsItem
            subtitle={
              isAdmin ? t('settings.users.subtitle') : t('settings.users.adminOnly')
            }
            title={t('settings.users.title')}
            onPress={() => navigation.navigate('UserList')}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('reports.title')}</Text>
        <View style={styles.groupCard}>
          <SettingsItem
            subtitle={t('reports.subtitle')}
            title={t('reports.title')}
            onPress={() => navigation.navigate('ReportsDashboard')}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('settings.groupData')}</Text>
        <View style={styles.groupCard}>
          <SettingsItem
            subtitle={t('settings.backupSubtitle')}
            title={t('settings.backupTitle')}
            onPress={() => navigation.navigate('Backup')}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('settings.groupDanger')}</Text>
        <View style={[styles.groupCard, styles.dangerCard]}>
          <SettingsItem
            subtitle={t('settings.wipe.dangerSubtitle')}
            title={t('settings.wipe.dangerTitle')}
            onPress={() => navigation.navigate('WipeData')}
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
  dangerCard: {
    borderColor: colors.red[500],
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
  divider: {
    backgroundColor: colors.black[600],
    height: 1,
  },
});
