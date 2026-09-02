import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Alert, Share } from 'react-native';

import { database } from '../../../database';
import { MockPrinterAdapter } from '../../../hardware/printer/mockPrinterAdapter';
import { ReceiptService } from '../../../services/ReceiptService';
import { colors, radius, spacing, typography } from '../../../theme';
import { formatRupiah } from '../../../utils/money';
import type { PosStackParamList } from '../../../app/navigation';

type NavProp = NativeStackNavigationProp<PosStackParamList, 'PaymentSuccess'>;
type RoutePropType = RouteProp<PosStackParamList, 'PaymentSuccess'>;

export const PaymentSuccessScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { transactionId, invoiceNo, change, total } = route.params;

  const scale = React.useRef(new Animated.Value(0)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  const receiptService = React.useMemo(
    () => new ReceiptService(database, new MockPrinterAdapter()),
    [],
  );
  const [printing, setPrinting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const handleNewTransaction = React.useCallback(() => {
    navigation.navigate('PosMain');
  }, [navigation]);

  const handlePrint = React.useCallback(async () => {
    setPrinting(true);
    setFeedback(null);
    const result = await receiptService.printReceipt(transactionId);
    setPrinting(false);
    if (result.status === 'ok') {
      setFeedback(t('success.printSuccess'));
    } else if (result.status === 'not_found') {
      setFeedback(t('errors.receiptNotFound'));
      Alert.alert(t('success.print'), t('errors.receiptNotFound'));
    } else {
      setFeedback(result.message);
      Alert.alert(t('success.print'), result.message, [
        { text: t('receipt.retry'), onPress: () => handlePrint() },
        { text: t('common.ok'), style: 'cancel' },
      ]);
    }
  }, [receiptService, transactionId, t]);

  const handleShare = React.useCallback(async () => {
    setFeedback(null);
    const text = await receiptService.buildShareText(transactionId);
    if (!text) {
      setFeedback(t('errors.receiptNotFound'));
      return;
    }
    try {
      await Share.share({ message: text });
      setFeedback(t('success.shareHint'));
    } catch {
      setFeedback(t('success.printFailed'));
    }
  }, [receiptService, transactionId, t]);

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.checkWrap,
            {
              opacity,
              transform: [{ scale: scale.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
            },
          ]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>

        <Text style={styles.title}>{t('success.title')}</Text>

        <Text style={styles.invoiceNo} testID="success-invoice">
          {invoiceNo}
        </Text>

        <View style={styles.changeBlock}>
          <Text style={styles.changeLabel}>{t('success.change')}</Text>
          <Text style={styles.changeValue} testID="success-change">
            {formatRupiah(change)}
          </Text>
          {total > 0 ? (
            <Text style={styles.totalHint} testID="success-total">
              {t('payment.totalDue')} {formatRupiah(total)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={printing}
          onPress={handlePrint}
          style={[styles.printButton, printing && styles.buttonDisabled]}
          testID="success-print">
          <Text style={styles.printButtonText}>
            {printing ? t('receipt.printing') : t('success.print')}
          </Text>
        </TouchableOpacity>
        {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}

        <View style={styles.secondaryRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleShare}
            style={styles.secondaryButton}
            testID="success-share">
            <Text style={styles.secondaryButtonText}>{t('success.share')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleNewTransaction}
            style={styles.ghostButton}
            testID="success-new">
            <Text style={styles.ghostButtonText}>{t('success.newTransaction')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const CHECK_SIZE = 80;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingTop: spacing.xxl,
  },
  checkWrap: {
    alignItems: 'center',
    backgroundColor: colors.green[500],
    borderRadius: CHECK_SIZE / 2,
    height: CHECK_SIZE,
    justifyContent: 'center',
    width: CHECK_SIZE,
  },
  checkMark: {
    color: colors.white[50],
    fontSize: 44,
    fontWeight: '700',
    lineHeight: 44,
    textAlign: 'center',
  },
  title: {
    ...typography.title,
    color: colors.white[50],
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  invoiceNo: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  changeBlock: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  changeLabel: {
    ...typography.micro,
    color: colors.white[150],
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  changeValue: {
    ...typography.display,
    color: colors.green[500],
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  totalHint: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.sm,
  },
  actions: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  printButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    justifyContent: 'center',
    minHeight: 48,
  },
  printButtonText: {
    ...typography.heading,
    color: colors.black[900],
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderRadius: radius.button,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    ...typography.heading,
    color: colors.white[300],
    fontSize: 15,
  },
  ghostButton: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.button,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  ghostButtonText: {
    ...typography.heading,
    color: colors.white[50],
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  feedbackText: {
    ...typography.caption,
    color: colors.white[300],
    textAlign: 'center',
  },
});
