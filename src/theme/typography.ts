import { TextStyle } from 'react-native';

export const typography = {
  display: {
    fontSize: 32,
    fontWeight: '700',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  heading: {
    fontSize: 17,
    fontWeight: '600',
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
  },
  micro: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
