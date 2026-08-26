import { Q } from '@nozbe/watermelondb';
import {
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as React from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { database } from '../../../database';
import Setting from '../../../database/models/setting';
import User from '../../../database/models/user';
import {
  AuthService,
  PIN_MIN_LENGTH,
} from '../../../services/AuthService';
import { colors, radius, spacing, typography } from '../../../theme';
import type { RootStackParamList } from '../../../app/navigation';
import { MAX_PIN_DIGITS, PinDots } from '../components/PinDots';
import { NumericKeypad } from '../components/NumericKeypad';

type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>;

type ErrorState = {
  key: string;
  params?: Record<string, unknown>;
} | null;

const STORE_NAME_SETTING_KEY = 'store_name';
const COUNTDOWN_TICK_MS = 500;

export const LoginScreen = ({ navigation }: LoginScreenProps) => {
  const { t } = useTranslation();

  const authService = React.useMemo(() => new AuthService(database), []);

  const [users, setUsers] = React.useState<User[] | null>(null);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(
    null,
  );
  const [storeName, setStoreName] = React.useState<string | null>(null);
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState<ErrorState>(null);
  const [lockoutEndAt, setLockoutEndAt] = React.useState<number | null>(null);
  const [lockSeconds, setLockSeconds] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  const shakeX = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const activeUsers = await database
        .get<User>('users')
        .query(Q.where('is_active', true), Q.where('deleted', false))
        .fetch();
      if (cancelled) {
        return;
      }
      setUsers(activeUsers);
      setSelectedUserId(activeUsers[0]?.id ?? null);

      try {
        const setting = await database
          .get<Setting>('settings')
          .query(Q.where('key', STORE_NAME_SETTING_KEY))
          .fetch();
        if (!cancelled && setting.length > 0) {
          setStoreName(setting[0].value);
        }
      } catch {
        // Nama toko opsional; fallback ke nama app.
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (lockoutEndAt === null) {
      return;
    }
    const tick = () => {
      const remainingSec = Math.max(
        0,
        Math.ceil((lockoutEndAt - Date.now()) / 1000),
      );
      setLockSeconds(remainingSec);
      if (remainingSec === 0) {
        setLockoutEndAt(null);
        setError(null);
      }
    };
    tick();
    const intervalId = setInterval(tick, COUNTDOWN_TICK_MS);
    return () => clearInterval(intervalId);
  }, [lockoutEndAt]);

  const runShake = React.useCallback(() => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, {
        duration: 60,
        toValue: -10,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        duration: 60,
        toValue: 10,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        duration: 60,
        toValue: -6,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        duration: 60,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeX]);

  const showError = React.useCallback((nextError: NonNullable<ErrorState>) => {
    setError(nextError);
    AccessibilityInfo.announceForAccessibility(
      t(nextError.key, nextError.params),
    );
  }, [t]);

  const handleSubmit = React.useCallback(
    async (candidatePin: string) => {
      if (
        selectedUserId === null ||
        busy ||
        lockSeconds > 0 ||
        candidatePin.length < PIN_MIN_LENGTH
      ) {
        return;
      }

      setBusy(true);
      try {
        const result = await authService.login(selectedUserId, candidatePin);
        switch (result.status) {
          case 'ok':
            navigation.replace('MainTabs');
            break;
          case 'invalid_pin':
            runShake();
            showError({
              key: 'auth.wrongPin',
              params: { count: result.remainingAttempts },
            });
            break;
          case 'locked':
            setLockoutEndAt(Date.now() + result.retryAfterMs);
            break;
          case 'pin_too_short':
            showError({ key: 'auth.pinTooShort' });
            break;
          case 'user_inactive':
            showError({ key: 'auth.userInactive' });
            break;
          case 'user_not_found':
            showError({ key: 'auth.userNotFound' });
            break;
        }
      } finally {
        setBusy(false);
        setPin('');
      }
    },
    [
      authService,
      busy,
      lockSeconds,
      navigation,
      runShake,
      selectedUserId,
      showError,
    ],
  );

  const handleDigit = React.useCallback(
    (digit: string) => {
      if (busy || lockSeconds > 0 || pin.length >= MAX_PIN_DIGITS) {
        return;
      }
      const next = pin + digit;
      setPin(next);
      setError(null);
      // Submit otomatis saat digit penuh; tombol Masuk untuk PIN 4-5 digit.
      if (next.length === MAX_PIN_DIGITS) {
        handleSubmit(next);
      }
    },
    [busy, handleSubmit, lockSeconds, pin],
  );

  const handleDelete = React.useCallback(() => {
    setPin((current) => current.slice(0, -1));
  }, []);

  const locked = lockSeconds > 0 || users?.length === 0;
  const canSubmit =
    !locked && !busy && pin.length >= PIN_MIN_LENGTH && selectedUserId !== null;

  return (
    <View style={styles.container}>
      <Text style={styles.storeName}>{storeName ?? t('auth.appName')}</Text>
      <Text style={styles.subtitle}>{t('auth.title')}</Text>

      <Animated.View style={[styles.dotsWrapper, { transform: [{ translateX: shakeX }] }]}>
        <PinDots length={pin.length} />
      </Animated.View>

      <View accessibilityLiveRegion="polite" style={styles.messageSlot}>
        {error !== null ? (
          <Text style={styles.errorText}>{t(error.key, error.params)}</Text>
        ) : null}
        {lockSeconds > 0 ? (
          <Text style={styles.lockedText}>
            {t('auth.locked', { seconds: lockSeconds })}
          </Text>
        ) : null}
      </View>

      {users !== null && users.length > 1 ? (
        <View
          accessibilityLabel={t('auth.chooseUser')}
          accessible
          style={styles.userRow}>
          {users.map((user) => (
            <TouchableOpacity
              key={user.id}
              onPress={() =>
                setSelectedUserId((current) => (current === user.id ? current : user.id))
              }
              style={[
                styles.userChip,
                user.id === selectedUserId && styles.userChipActive,
              ]}>
              <Text
                style={[
                  styles.userChipText,
                  user.id === selectedUserId && styles.userChipTextActive,
                ]}>
                {user.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {users !== null && users.length === 0 ? (
        <Text style={styles.emptyText}>{t('auth.noUsers')}</Text>
      ) : (
        <>
          <NumericKeypad
            disabled={locked}
            onDelete={handleDelete}
            onDigit={handleDigit}
          />
          <TouchableOpacity
            disabled={!canSubmit}
            onPress={() => handleSubmit(pin)}
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}>
            <Text style={styles.submitButtonText}>{t('auth.login')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  dotsWrapper: {
    marginTop: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.white[300],
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.red[500],
    textAlign: 'center',
  },
  lockedText: {
    ...typography.body,
    color: colors.yellow[400],
    textAlign: 'center',
  },
  messageSlot: {
    minHeight: typography.body.fontSize * 2,
    marginTop: spacing.md,
  },
  storeName: {
    ...typography.title,
    color: colors.white[50],
    textAlign: 'center',
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    justifyContent: 'center',
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
  },
  submitButtonDisabled: {
    backgroundColor: colors.black[500],
  },
  submitButtonText: {
    ...typography.heading,
    color: colors.white[50],
  },
  subtitle: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  userChip: {
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginHorizontal: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  userChipActive: {
    borderColor: colors.orange[500],
  },
  userChipText: {
    ...typography.body,
    color: colors.white[300],
  },
  userChipTextActive: {
    color: colors.white[50],
  },
  userRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
});
