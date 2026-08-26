import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../theme';

export const MAX_PIN_DIGITS = 6;

const DOT_SIZE = 16;

type Props = {
  length: number;
  max?: number;
};

export const PinDots = ({ length, max = MAX_PIN_DIGITS }: Props) => {
  return (
    <View
      accessible
      accessibilityLabel={`${length} / ${max}`}
      style={styles.row}>
      {Array.from({ length: max }, (_, index) => (
        <View
          key={index}
          testID={index < length ? 'pin-dot-filled' : 'pin-dot-empty'}
          style={[styles.dot, index < length && styles.dotFilled]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  dot: {
    backgroundColor: 'transparent',
    borderColor: colors.black[500],
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    height: DOT_SIZE,
    marginHorizontal: spacing.sm,
    width: DOT_SIZE,
  },
  dotFilled: {
    backgroundColor: colors.orange[500],
    borderColor: colors.orange[500],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
