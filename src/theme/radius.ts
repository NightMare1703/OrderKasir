export const radius = {
  input: 12,
  button: 12,
  card: 16,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;
