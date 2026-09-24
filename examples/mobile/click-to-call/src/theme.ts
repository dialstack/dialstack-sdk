export const colors = {
  bg: '#f4f6f8',
  card: '#ffffff',
  text: '#0b1220',
  muted: '#5b6472',
  border: '#dde2e8',
  primary: '#2563eb',
  primaryText: '#ffffff',
  danger: '#b42318',
};

/** The surface every card in the app sits on. */
export const card = {
  backgroundColor: colors.card,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: 12,
  padding: 16,
} as const;
