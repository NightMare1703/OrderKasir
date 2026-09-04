import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { database } from '../../../database';
import type User from '../../../database/models/user';
import { UserService } from '../../../services/UserService';
import { useSessionStore } from '../../auth/sessionStore';
import { colors, radius, spacing, typography } from '../../../theme';
import type { SettingsStackParamList } from '../../../app/navigation';

export const UserListScreen = (): React.JSX.Element => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const service = React.useMemo(() => new UserService(database), []);
  const currentUserId = useSessionStore((s) => s.currentUserId);

  const [users, setUsers] = React.useState<User[]>([]);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const all = await service.listUsers(true);
      setUsers(all);
      if (currentUserId) {
        const me = await service.findUser(currentUserId);
        setIsAdmin(me?.role === 'admin');
      } else {
        setIsAdmin(false);
      }
    } finally {
      setLoading(false);
    }
  }, [currentUserId, service]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  React.useEffect(() => {
    navigation.setOptions({ title: t('settings.users.title') } as never);
  }, [navigation, t]);

  const renderItem = React.useCallback(
    ({ item }: { item: User }) => (
      <TouchableOpacity
        accessibilityRole="button"
        disabled={!isAdmin}
        style={styles.row}
        onPress={() => navigation.navigate('UserForm', { userId: item.id })}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          <Text style={styles.rowSubtitle}>
            {item.role === 'admin' ? t('settings.users.roleAdmin') : t('settings.users.roleKasir')} ·{' '}
            {item.isActive ? t('settings.users.statusActive') : t('settings.users.statusInactive')}
          </Text>
        </View>
        {isAdmin ? <Text style={styles.chevron}>›</Text> : null}
      </TouchableOpacity>
    ),
    [isAdmin, navigation, t],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!isAdmin ? (
        <View style={styles.adminWarning}>
          <Text style={styles.adminWarningText}>{t('settings.users.adminOnly')}</Text>
        </View>
      ) : null}

      <View style={styles.listWrap}>
        <FlashList
          contentContainerStyle={styles.listContent}
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t('settings.users.emptyTitle')}</Text>
              <Text style={styles.emptyHint}>{t('settings.users.emptyHint')}</Text>
            </View>
          }
        />
      </View>

      {isAdmin ? (
        <View style={styles.footer}>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={() => navigation.navigate('UserForm', {})}>
            <Text style={styles.primaryButtonText}>{t('settings.users.addAction')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  center: {
    alignItems: 'center',
    backgroundColor: colors.black[900],
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  adminWarning: {
    backgroundColor: colors.yellow[400],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  adminWarningText: {
    ...typography.caption,
    color: colors.black[900],
    fontWeight: '600',
  },
  listWrap: {
    flex: 1,
    minHeight: 200,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowTitle: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: 2,
  },
  chevron: {
    ...typography.title,
    color: colors.white[150],
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.white[50],
  },
  emptyHint: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  footer: {
    backgroundColor: colors.black[800],
    borderTopColor: colors.black[600],
    borderTopWidth: 1,
    padding: spacing.lg,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.card,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    ...typography.heading,
    color: colors.white[50],
    fontWeight: '700',
  },
  hint: {
    ...typography.caption,
    color: colors.white[150],
  },
});
