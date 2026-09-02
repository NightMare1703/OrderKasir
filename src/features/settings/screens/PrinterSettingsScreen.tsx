import { Q } from '@nozbe/watermelondb';
import { useNavigation } from '@react-navigation/native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { database } from '../../../database';
import { MockPrinterAdapter } from '../../../hardware/printer/mockPrinterAdapter';
import type { PaperWidth, PrinterDevice } from '../../../hardware/printer/types';
import { PRINTER_ERROR_MESSAGE } from '../../../hardware/printer/types';
import { PrinterService } from '../../../services/PrinterService';
import { colors, radius, spacing, typography } from '../../../theme';

type DeviceRowProps = {
  device: PrinterDevice;
  isDefault: boolean;
  isConnected: boolean;
  connecting: boolean;
  onConnect: () => void;
};

const DeviceRow = ({ device, isDefault, isConnected, connecting, onConnect }: DeviceRowProps) => {
  const { t } = useTranslation();
  return (
    <View style={styles.deviceRow}>
      <View style={styles.deviceInfo}>
        <Text numberOfLines={1} style={styles.deviceName}>
          {device.name}
        </Text>
        <Text numberOfLines={1} style={styles.deviceAddress}>
          {device.address}
        </Text>
        <View style={styles.deviceBadges}>
          {isDefault ? (
            <View style={styles.badgeDefault}>
              <Text style={styles.badgeDefaultText}>{t('settings.printer.defaultBadge')}</Text>
            </View>
          ) : null}
          {isConnected ? (
            <View style={styles.badgeConnected}>
              <Text style={styles.badgeConnectedText}>{t('settings.printer.connectedBadge')}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <TouchableOpacity
        disabled={connecting || isConnected}
        onPress={onConnect}
        style={[styles.connectButton, isConnected && styles.connectButtonConnected]}>
        {connecting ? (
          <ActivityIndicator color={colors.black[900]} size="small" />
        ) : (
          <Text style={[styles.connectButtonText, isConnected && styles.connectButtonTextMuted]}>
            {isConnected ? t('settings.printer.connected') : t('settings.printer.connect')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export const PrinterSettingsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();

  const printerService = React.useMemo(() => {
    const adapter = new MockPrinterAdapter();
    const getStoreName = async () => {
      try {
        const rows = await database
          .get('settings' as never)
          .query(Q.where('key', 'store_name'))
          .fetch();
        const first = rows[0] as unknown as { value: string } | undefined;
        if (!first) return null;
        try {
          const parsed = JSON.parse(first.value);
          return typeof parsed === 'string' ? parsed : first.value;
        } catch {
          return first.value;
        }
      } catch {
        return null;
      }
    };
    return new PrinterService(database, adapter as never, { getStoreName });
  }, []);

  const [devices, setDevices] = React.useState<PrinterDevice[] | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [connectingAddress, setConnectingAddress] = React.useState<string | null>(null);
  const [defaultPrinter, setDefaultPrinter] = React.useState<PrinterDevice | null>(null);
  const [connectedDevice, setConnectedDevice] = React.useState<PrinterDevice | null>(null);
  const [paperWidth, setPaperWidth] = React.useState<PaperWidth>('58mm');
  const [testing, setTesting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [shareText, setShareText] = React.useState<string | null>(null);
  const [testSuccess, setTestSuccess] = React.useState(false);

  const refreshState = React.useCallback(async () => {
    const [def, width, connected] = await Promise.all([
      printerService.getDefaultPrinter(),
      printerService.getPaperWidth(),
      printerService.isConnected().then((ok) => (ok ? printerService.getConnectedDevice() : null)),
    ]);
    setDefaultPrinter(def);
    setPaperWidth(width);
    setConnectedDevice(connected);
  }, [printerService]);

  React.useEffect(() => {
    refreshState();
  }, [refreshState]);

  React.useEffect(() => {
    navigation.setOptions({ title: t('settings.printer.title') } as never);
  }, [navigation, t]);

  const handleScan = React.useCallback(async () => {
    setScanning(true);
    setErrorMessage(null);
    setTestSuccess(false);
    const result = await printerService.scan();
    setScanning(false);
    if (result.status === 'ok') {
      setDevices(result.devices);
      if (result.devices.length === 0) {
        setErrorMessage(t('settings.printer.noDevicesFound'));
      }
    } else {
      setErrorMessage(result.message);
    }
  }, [printerService, t]);

  const handleConnect = React.useCallback(
    async (device: PrinterDevice) => {
      setConnectingAddress(device.address);
      setErrorMessage(null);
      setTestSuccess(false);
      const result = await printerService.connect(device.address, device.name);
      setConnectingAddress(null);
      if (result.status === 'connected') {
        await refreshState();
      } else {
        setErrorMessage(result.message);
      }
    },
    [printerService, refreshState],
  );

  const handlePaperWidth = React.useCallback(
    async (width: PaperWidth) => {
      await printerService.setPaperWidth(width);
      setPaperWidth(width);
    },
    [printerService],
  );

  const handleTestPrint = React.useCallback(async () => {
    setTesting(true);
    setErrorMessage(null);
    setTestSuccess(false);
    setShareText(null);
    const result = await printerService.testPrint();
    setTesting(false);
    if (result.status === 'ok') {
      setTestSuccess(true);
      await refreshState();
    } else {
      setErrorMessage(result.message);
      const fallback = await printerService.buildTestShareText();
      setShareText(fallback);
    }
  }, [printerService, refreshState]);

  const handleShare = React.useCallback(async () => {
    const text = shareText ?? (await printerService.buildTestShareText());
    try {
      await Share.share({ message: text });
    } catch {
      setErrorMessage(PRINTER_ERROR_MESSAGE);
    }
  }, [printerService, shareText]);

  const handleRetry = React.useCallback(async () => {
    if (errorMessage) {
      await handleTestPrint();
    }
  }, [errorMessage, handleTestPrint]);

  const renderDevice = React.useCallback(
    ({ item }: { item: PrinterDevice }) => (
      <DeviceRow
        connecting={connectingAddress === item.address}
        device={item}
        isConnected={connectedDevice?.address === item.address}
        isDefault={defaultPrinter?.address === item.address}
        onConnect={() => handleConnect(item)}
      />
    ),
    [connectedDevice, connectingAddress, defaultPrinter, handleConnect],
  );

  const keyExtractor = React.useCallback((item: PrinterDevice) => item.address, []);

  return (
    <View style={styles.container}>
      <FlatList
        ListHeaderComponent={
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('settings.printer.defaultPrinterLabel')}</Text>
              {defaultPrinter ? (
                <>
                  <Text style={styles.defaultName}>{defaultPrinter.name}</Text>
                  <Text style={styles.defaultAddress}>{defaultPrinter.address}</Text>
                  {connectedDevice?.address === defaultPrinter.address ? (
                    <View style={styles.connectedPill}>
                      <Text style={styles.connectedPillText}>{t('settings.printer.connectedBadge')}</Text>
                    </View>
                  ) : (
                    <Text style={styles.notConnectedHint}>{t('settings.printer.notConnectedHint')}</Text>
                  )}
                </>
              ) : (
                <Text style={styles.emptyDefault}>{t('settings.printer.noDefault')}</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('settings.printer.paperWidthLabel')}</Text>
              <View style={styles.widthRow}>
                {(['58mm', '80mm'] as const).map((w) => (
                  <TouchableOpacity
                    key={w}
                    onPress={() => handlePaperWidth(w)}
                    style={[styles.widthChip, paperWidth === w && styles.widthChipActive]}>
                    <Text style={[styles.widthChipText, paperWidth === w && styles.widthChipTextActive]}>
                      {w}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.widthHint}>
                {paperWidth === '58mm'
                  ? t('settings.printer.charsHint', { chars: 32 })
                  : t('settings.printer.charsHint', { chars: 48 })}
              </Text>
            </View>

            <TouchableOpacity
              disabled={scanning}
              onPress={handleScan}
              style={[styles.primaryButton, scanning && styles.buttonDisabled]}>
              {scanning ? (
                <ActivityIndicator color={colors.black[900]} />
              ) : (
                <Text style={styles.primaryButtonText}>{t('settings.printer.scan')}</Text>
              )}
            </TouchableOpacity>

            {devices !== null ? (
              <Text style={styles.sectionLabel}>
                {t('settings.printer.foundDevices', { count: devices.length })}
              </Text>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorCard}>
                <View style={styles.errorDot} />
                <Text style={styles.errorText}>{errorMessage}</Text>
                <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
                  <Text style={styles.retryButtonText}>{t('settings.printer.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {testSuccess ? (
              <View style={styles.successCard}>
                <View style={styles.successDot} />
                <Text style={styles.successText}>{t('settings.printer.testSuccess')}</Text>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View style={styles.footerArea}>
            <TouchableOpacity
              disabled={testing}
              onPress={handleTestPrint}
              style={[styles.primaryButton, testing && styles.buttonDisabled]}>
              {testing ? (
                <ActivityIndicator color={colors.white[50]} />
              ) : (
                <Text style={styles.primaryButtonTextLight}>{t('settings.printer.testPrint')}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.shareCard}>
              <Text style={styles.shareTitle}>{t('settings.printer.fallbackTitle')}</Text>
              <Text style={styles.shareHint}>{t('settings.printer.fallbackHint')}</Text>
              <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
                <Text style={styles.shareButtonText}>{t('settings.printer.shareDigital')}</Text>
              </TouchableOpacity>
              {shareText ? (
                <View style={styles.sharePreview}>
                  <Text style={styles.sharePreviewText} numberOfLines={8}>
                    {shareText}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        }
        contentContainerStyle={styles.listContent}
        data={devices ?? []}
        keyExtractor={keyExtractor}
        renderItem={renderDevice}
        ListEmptyComponent={
          devices !== null && devices.length === 0 ? (
            <View style={styles.emptyDevices}>
              <Text style={styles.emptyDevicesText}>{t('settings.printer.noDevicesFound')}</Text>
            </View>
          ) : devices === null ? (
            <View style={styles.emptyDevices}>
              <Text style={styles.emptyDevicesText}>{t('settings.printer.scanHint')}</Text>
            </View>
          ) : undefined
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.black[900],
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  cardTitle: {
    ...typography.micro,
    color: colors.white[150],
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  defaultName: {
    ...typography.heading,
    color: colors.white[50],
    marginTop: spacing.sm,
  },
  defaultAddress: {
    ...typography.caption,
    color: colors.white[300],
    marginTop: spacing.xs,
  },
  emptyDefault: {
    ...typography.body,
    color: colors.white[150],
    marginTop: spacing.sm,
  },
  connectedPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.green[500],
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  connectedPillText: {
    ...typography.micro,
    color: colors.black[900],
    fontWeight: '700',
  },
  notConnectedHint: {
    ...typography.caption,
    color: colors.yellow[400],
    marginTop: spacing.sm,
  },
  widthRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  widthChip: {
    borderColor: colors.black[600],
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  widthChipActive: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  widthChipText: {
    ...typography.caption,
    color: colors.white[300],
    fontWeight: '600',
  },
  widthChipTextActive: {
    color: colors.black[900],
  },
  widthHint: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.orange[500],
    borderRadius: radius.button,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    ...typography.heading,
    color: colors.black[900],
  },
  primaryButtonTextLight: {
    ...typography.heading,
    color: colors.white[50],
  },
  buttonDisabled: {
    backgroundColor: colors.black[500],
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.white[150],
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  deviceRow: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 72,
  },
  deviceInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  deviceName: {
    ...typography.body,
    color: colors.white[50],
  },
  deviceAddress: {
    ...typography.caption,
    color: colors.white[150],
    marginTop: 2,
  },
  deviceBadges: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  badgeDefault: {
    backgroundColor: colors.black[700],
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeDefaultText: {
    ...typography.micro,
    color: colors.white[300],
  },
  badgeConnected: {
    backgroundColor: colors.green[500],
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeConnectedText: {
    ...typography.micro,
    color: colors.black[900],
    fontWeight: '700',
  },
  connectButton: {
    backgroundColor: colors.white[50],
    borderRadius: radius.button,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 88,
  },
  connectButtonConnected: {
    backgroundColor: colors.black[700],
    borderColor: colors.black[600],
    borderWidth: 1,
  },
  connectButtonText: {
    ...typography.caption,
    color: colors.black[900],
    fontWeight: '600',
  },
  connectButtonTextMuted: {
    color: colors.white[300],
  },
  errorCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.red[500],
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorDot: {
    backgroundColor: colors.red[500],
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  errorText: {
    ...typography.body,
    color: colors.white[50],
    flex: 1,
  },
  retryButton: {
    backgroundColor: colors.white[50],
    borderRadius: radius.button,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButtonText: {
    ...typography.caption,
    color: colors.black[900],
    fontWeight: '600',
  },
  successCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.green[500],
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successDot: {
    backgroundColor: colors.green[500],
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  successText: {
    ...typography.body,
    color: colors.white[50],
    flex: 1,
  },
  footerArea: {
    marginTop: spacing.lg,
  },
  shareCard: {
    backgroundColor: colors.black[800],
    borderColor: colors.black[600],
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  shareTitle: {
    ...typography.heading,
    color: colors.white[50],
  },
  shareHint: {
    ...typography.body,
    color: colors.white[300],
    marginTop: spacing.xs,
  },
  shareButton: {
    alignItems: 'center',
    borderColor: colors.black[600],
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  shareButtonText: {
    ...typography.body,
    color: colors.white[50],
    fontWeight: '600',
  },
  sharePreview: {
    backgroundColor: colors.black[900],
    borderRadius: radius.input,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  sharePreviewText: {
    ...typography.caption,
    color: colors.white[300],
    fontFamily: 'monospace',
  },
  emptyDevices: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyDevicesText: {
    ...typography.body,
    color: colors.white[150],
    textAlign: 'center',
  },
});
