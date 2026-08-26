import { useTranslation } from 'react-i18next';
import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../../theme';

const KEYS: (string | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'delete'],
];

const KEY_SIZE = 64;

type Props = {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
};

// Keypad numerik lokal auth; diekstrak ke components/ saat pembayaran
// membutuhkan pemakaian kedua (AGENTS.md §5).
export const NumericKeypad = ({ onDigit, onDelete, disabled = false }: Props) => {
  const { t } = useTranslation();

  const pressDigit = React.useCallback(
    (digit: string) => () => {
      if (!disabled) {
        onDigit(digit);
      }
    },
    [disabled, onDigit],
  );

  const pressDelete = React.useCallback(() => {
    if (!disabled) {
      onDelete();
    }
  }, [disabled, onDelete]);

  return (
    <View style={styles.grid}>
      {KEYS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key, keyIndex) => {
            if (key === null) {
              return <View key={keyIndex} style={styles.key} />;
            }
            const isDelete = key === 'delete';
            return (
              <TouchableOpacity
                key={keyIndex}
                accessibilityLabel={
                  isDelete ? t('auth.delete') : undefined
                }
                disabled={disabled}
                onPress={isDelete ? pressDelete : pressDigit(key)}
                style={[styles.key, disabled && styles.keyDisabled]}>
                <Text style={styles.keyText}>{isDelete ? '⌫' : key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    alignSelf: 'center',
    flexDirection: 'column',
  },
  key: {
    alignItems: 'center',
    backgroundColor: colors.black[700],
    borderRadius: radius.button,
    height: KEY_SIZE,
    justifyContent: 'center',
    margin: spacing.xs,
    width: KEY_SIZE * 1.75,
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyText: {
    ...typography.heading,
    color: colors.white[50],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
