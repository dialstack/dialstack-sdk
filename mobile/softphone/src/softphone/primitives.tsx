/**
 * Shared RN primitives + styles for the softphone components: the SVG glyph
 * renderer, the incoming pulse dot, the in-call control button, the palette-driven
 * StyleSheet, the localized state-label map, and a small chunk() helper. Kept in
 * one module so DialPad / IncomingCall / OngoingCall share them (mirrors how the
 * web components share Glyph + softphone-styles).
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { softphoneDimensions as D, type SoftphonePalette } from '@dialstack/sdk/components/softphone-theme';
import type { SoftphoneGlyph } from '@dialstack/sdk/components/softphone-icons';

// Localized state labels. The shared `callStateLabelKey` decides WHICH key a
// given state maps to (kept in sync with the web softphone); this map is the RN
// copy of the strings.
export const STATE_LABEL: Record<string, string> = {
  stateTrying: 'Calling…',
  stateRinging: 'Ringing…',
  stateActive: 'In call',
  stateHeld: 'On hold',
  stateEnded: 'Call ended',
};

/** Renders a shared softphone glyph as an SVG path, matching the web <Glyph>. */
export function Glyph({
  glyph,
  size,
  color,
}: {
  glyph: SoftphoneGlyph;
  size: number;
  color: string;
}): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d={glyph.path} transform={glyph.transform} />
    </Svg>
  );
}

/** The incoming-call pulsing dot, matching the web softphone's ds-incoming-pulse. */
export function PulseDot({ color }: { color: string }): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 2.6,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 20, marginVertical: 4 }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 12,
          height: 12,
          borderRadius: 999,
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        }}
      />
      <View style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: color }} />
    </View>
  );
}

export function ControlButton({
  label,
  glyph,
  on,
  onPress,
  palette,
  styles,
}: {
  label: string;
  glyph: SoftphoneGlyph;
  on: boolean;
  onPress: () => void;
  palette: SoftphonePalette;
  styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={styles.control}>
      <View style={[styles.controlGlyphWrap, on && styles.controlGlyphOn]}>
        <Glyph
          glyph={glyph}
          size={D.controlButtonSize * 0.42}
          color={on ? palette.onAccent : palette.text}
        />
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

export function chunk<T>(arr: ReadonlyArray<T>, size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function makeStyles(p: SoftphonePalette) {
  return StyleSheet.create({
    // A centered card (like the web Softphone) rather than a full-bleed panel.
    outer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: D.space },
    outerLandscape: { justifyContent: 'flex-start', paddingTop: D.space },
    root: {
      width: '100%',
      maxWidth: D.maxWidth,
      alignSelf: 'center',
      backgroundColor: p.background,
      borderRadius: D.radius,
      padding: D.space,
      gap: D.space,
    },

    chip: {
      alignSelf: 'center',
      backgroundColor: p.surface,
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 12,
    },
    chipSpacer: { height: 26 },
    chipText: { color: p.textSecondary, fontSize: 12, fontWeight: '600' },
    chipError: { backgroundColor: 'rgba(229,72,77,0.16)' },
    chipErrorText: { color: p.danger },

    display: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 8 },
    destination: { flex: 1, fontSize: 30, fontWeight: '500', color: p.text, padding: 0 },
    backspace: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    backspaceText: { fontSize: 22, color: p.textSecondary },

    keypad: { gap: D.keyGap },
    keyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: D.keyGap },
    key: {
      flex: 1,
      aspectRatio: 1,
      maxWidth: 84,
      alignSelf: 'center',
      borderRadius: 999,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyDtmf: { aspectRatio: undefined, paddingVertical: 12 },
    keyPressed: { backgroundColor: p.surfaceActive },
    keyDigit: { fontSize: 26, fontWeight: '500', color: p.text, lineHeight: 30 },
    keyLetters: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1.5,
      color: p.textSecondary,
      marginTop: 2,
    },

    actions: { flexDirection: 'row', justifyContent: 'center', gap: 48 },
    actionsSpread: { justifyContent: 'space-evenly' },
    action: {
      width: D.actionButtonSize,
      height: D.actionButtonSize,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionSuccess: { backgroundColor: p.success },
    actionDanger: { backgroundColor: p.danger },
    actionDisabled: { opacity: 0.4 },
    actionPressed: { opacity: 0.85 },

    peer: { alignItems: 'center', gap: 4 },
    peerName: { fontSize: 26, fontWeight: '600', color: p.text, textAlign: 'center' },
    peerNumber: { fontSize: 15, color: p.textSecondary },
    callState: { alignItems: 'center', marginTop: 6, gap: 2 },
    callStateText: { fontSize: 14, color: p.textSecondary },
    duration: { fontSize: 18, fontWeight: '500', color: p.text },

    incomingLabel: {
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 1.5,
      color: p.textSecondary,
    },

    controls: { flexDirection: 'row', justifyContent: 'space-between' },
    control: { alignItems: 'center', gap: 6, flex: 1 },
    controlGlyphWrap: {
      width: D.controlButtonSize,
      height: D.controlButtonSize,
      borderRadius: 999,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlGlyphOn: { backgroundColor: p.accent },
    controlLabel: { fontSize: 12, color: p.textSecondary },

    dtmfPad: { gap: D.keyGap },
    transfer: { flexDirection: 'row', gap: 8 },
    transferInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: D.radius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: p.text,
      fontSize: 16,
    },
    transferSend: {
      backgroundColor: p.accent,
      borderRadius: D.radius,
      paddingHorizontal: 18,
      justifyContent: 'center',
    },
    transferSendText: { color: p.onAccent, fontWeight: '600' },

    // ---- E911 banner (RN parity with the web ds-e911 banner) ----
    e911: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: D.radius,
      backgroundColor: p.surface,
      overflow: 'hidden',
    },
    e911Toggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    e911ToggleText: {
      color: p.warning,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
    },
    e911Body: {
      borderTopWidth: 1,
      borderTopColor: p.border,
      padding: 12,
      gap: 8,
    },
    e911Hint: { fontSize: 12, color: p.textSecondary },
    e911Choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderRadius: 8,
      backgroundColor: p.background,
    },
    e911ChoiceAddr: { flex: 1, fontSize: 13, color: p.text },
    e911ChoiceCta: { fontSize: 12, fontWeight: '600', color: p.accent },
    e911Row: { flexDirection: 'row', gap: 8 },
    e911Field: { flex: 1, gap: 3 },
    e911FieldSm: { flex: 0, width: 96 },
    e911Label: { fontSize: 11, color: p.textSecondary },
    e911Input: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: p.text,
      fontSize: 14,
      backgroundColor: p.background,
    },
    e911Error: { fontSize: 12, color: p.danger },
    e911Btn: {
      backgroundColor: p.accent,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
    },
    e911BtnText: { color: p.onAccent, fontWeight: '600', fontSize: 14 },
    e911BtnSecondary: { backgroundColor: p.surface },
    e911BtnSecondaryText: { color: p.text, fontWeight: '600', fontSize: 14 },
    e911Actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  });
}
