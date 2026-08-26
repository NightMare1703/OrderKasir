export const colors = {
  black: {
    900: '#0A0A0B',
    800: '#131315',
    700: '#1D1D21',
    600: '#2A2A30',
    500: '#3A3A42',
  },
  orange: {
    400: '#FF8534',
    500: '#FF6A00',
    600: '#E55F00',
  },
  white: {
    50: '#FAFAFA',
    300: '#C7C7CC',
    150: '#8E8E93',
  },
  green: {
    500: '#34C759',
  },
  red: {
    500: '#FF453A',
  },
  yellow: {
    400: '#FFD60A',
  },
} as const;

export type ThemeColor = typeof colors;
