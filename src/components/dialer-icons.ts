/**
 * Dialer glyph path data, shared so the React Dialer and any other web surface
 * render the same icons. Each value is the `d` attribute of a single 24×24 path
 * (plus an optional transform), independent of the SDK's data-component icon set.
 */

export interface DialerGlyph {
  path: string;
  transform?: string;
}

export const dialerGlyphs = {
  phone: {
    path: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  },
  // Hang up / decline: the same handset as `phone`, rotated 135° so it lies flat
  // pointing down — the standard "call ended" glyph. (The Material two-knob
  // hang-up path rotated the same way reads as an upright handset, i.e. "answer",
  // so we rotate the plain handset instead.)
  hangup: {
    path: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
    transform: 'rotate(135 12 12)',
  },
  mic: {
    path: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z',
  },
  micOff: {
    path: 'M19 11h-1.7a5.6 5.6 0 0 1-.34 1.6l1.22 1.22A7 7 0 0 0 19 11zM4.27 3 3 4.27 9 10.27V11a3 3 0 0 0 4.42 2.65l1.05 1.05A4.96 4.96 0 0 1 12 16a5 5 0 0 1-5-5H5a7 7 0 0 0 6 6.92V21h2v-3.08c.5-.07.98-.2 1.43-.39L19.73 21 21 19.73 4.27 3zM15 5a3 3 0 0 0-6-.09l6 6V5z',
  },
  pause: { path: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' },
  keypad: {
    path: 'M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  },
  transfer: { path: 'M16 1l4 4-4 4V6H9V4h7V1zM8 23l-4-4 4-4v3h7v2H8v3z' },
  location: {
    path: 'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z',
  },
  chevronDown: { path: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z' },
} satisfies Record<string, DialerGlyph>;

export type DialerGlyphName = keyof typeof dialerGlyphs;
