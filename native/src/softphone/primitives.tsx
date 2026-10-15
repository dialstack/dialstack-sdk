/**
 * Shared RN primitives + styles for the softphone components: the SVG glyph
 * renderer, the incoming pulse dot, the in-call control button, the palette-driven
 * StyleSheet, the localized state-label map, and a small chunk() helper. Kept in
 * one module so DialPad / IncomingCall / OngoingCall share them (mirrors how the
 * web components share Glyph + softphone-styles).
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  softphoneDimensions as BASE_DIMENSIONS,
  type SoftphonePalette,
  type SoftphoneGlyph,
} from '@dialstack/sdk-react/core';

/**
 * The compact size tier for small hosts (see views/useRoomyHost): keys, action
 * and control buttons and spacing step down together so the screens fit.
 */
const COMPACT_DIMENSIONS = {
  ...BASE_DIMENSIONS,
  actionButtonSize: 48,
  controlButtonSize: 42,
  keyGap: 6,
  keyMaxSize: 44,
  space: 10,
};

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
  disabled = false,
}: {
  label: string;
  glyph: SoftphoneGlyph;
  on: boolean;
  onPress: () => void;
  palette: SoftphonePalette;
  styles: ReturnType<typeof makeStyles>;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.control, disabled && styles.controlDisabled]}
    >
      <View style={[styles.controlGlyphWrap, on && styles.controlGlyphOn]}>
        <Glyph
          glyph={glyph}
          size={(styles.controlGlyphWrap.width as number) * 0.42}
          color={on ? palette.onAccent : palette.text}
        />
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

const CONTROL_SLOTS = 6;

export function Chip({
  styles,
  tone = 'info',
  label,
  onDismiss,
  dismissLabel,
}: {
  styles: ReturnType<typeof makeStyles>;
  tone?: 'info' | 'error';
  label: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}): React.JSX.Element {
  const error = tone === 'error';
  const body = (
    <>
      <Text style={[styles.chipText, error && styles.chipErrorText]}>{label}</Text>
      {onDismiss ? <Text style={[styles.chipText, styles.chipErrorText]}>{'\u2715'}</Text> : null}
    </>
  );
  const chipStyle = [styles.chipPill, error && styles.chipError, styles.chip];
  return onDismiss ? (
    <Pressable
      onPress={onDismiss}
      accessibilityRole="alert"
      accessibilityLabel={dismissLabel}
      style={chipStyle}
    >
      {body}
    </Pressable>
  ) : (
    <View style={chipStyle}>{body}</View>
  );
}

export function ControlsSlot({
  styles,
}: {
  styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View style={[styles.controls, styles.controlsSlot]} pointerEvents="none" accessible={false}>
      {Array.from({ length: CONTROL_SLOTS }, (_, i) => (
        <View key={i} style={styles.control}>
          <View style={styles.controlGlyphWrap} />
          <Text style={styles.controlLabel}> </Text>
        </View>
      ))}
    </View>
  );
}

export function chunk<T>(arr: ReadonlyArray<T>, size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * iOS phone-pad keyboards have no return key, so nothing closes them: this bar
 * rides above the keyboard of any field whose `inputAccessoryViewID` is `id`.
 * Android needs none (Back closes the keyboard).
 */
export function KeyboardDoneBar({
  id,
  label,
  styles,
}: {
  id: string;
  label: string;
  styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element | null {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={id}>
      <View style={styles.keyboardDoneBar}>
        <Pressable onPress={Keyboard.dismiss} hitSlop={8} accessibilityRole="button">
          <Text style={styles.keyboardDoneText}>{label}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

export function makeStyles(p: SoftphonePalette, compact = false) {
  // Shadows the module-level D: everything below sizes from the active tier.
  const D = compact ? COMPACT_DIMENSIONS : BASE_DIMENSIONS;
  const KEY_MAX = Math.round(D.keyMaxSize * 1.1);
  // Type steps down with the tier.
  const fs = (base: number, small: number) => (compact ? small : base);
  return StyleSheet.create({
    outer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: D.space },
    outerLandscape: { justifyContent: 'flex-start', paddingTop: D.space },
    root: {
      flex: 1,
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: '100%',
    },
    chipPill: {
      backgroundColor: p.surface,
      borderRadius: 999,
      paddingVertical: fs(4, 2),
      paddingHorizontal: fs(12, 8),
    },
    dialScreen: { position: 'relative', flex: 1, minHeight: 0, gap: D.space },
    keyboardDoneBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: p.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: p.border,
    },
    keyboardDoneText: { color: p.accent, fontSize: 16, fontWeight: '600' },
    chipText: { color: p.textSecondary, fontSize: fs(12, 10), fontWeight: '600' },
    chipError: { backgroundColor: 'rgba(229,72,77,0.16)' },
    chipErrorText: { color: p.danger },

    display: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 0,
      gap: 8,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
    },
    destination: {
      flex: 1,
      minWidth: 0,
      fontSize: fs(30, 22),
      fontWeight: '500',
      color: p.text,
      textAlign: 'center',
      paddingVertical: 0,
      paddingHorizontal: 0,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    backspace: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    displaySpacer: { width: 40, height: 40 },
    backspaceText: { fontSize: 22, color: p.textSecondary },

    keypad: {
      gap: D.keyGap,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      justifyContent: 'center',
      maxWidth: KEY_MAX * 3 + D.keyGap * 2,
      width: '100%',
      alignSelf: 'center',
    },
    keyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: D.keyGap, flexShrink: 1 },
    key: {
      flex: 1,
      aspectRatio: 1,
      maxWidth: KEY_MAX,
      maxHeight: KEY_MAX,
      alignSelf: 'center',
      borderRadius: 999,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyCompact: { maxWidth: Math.min(76, KEY_MAX), maxHeight: Math.min(76, KEY_MAX) },
    keyPressed: { backgroundColor: p.surfaceActive },
    keyDigit: {
      fontSize: fs(26, 18),
      fontWeight: '500',
      color: p.text,
      lineHeight: fs(30, 21),
    },
    keyLetters: {
      fontSize: fs(10, 8),
      fontWeight: '600',
      letterSpacing: 1.5,
      color: p.textSecondary,
      marginTop: 2,
    },

    actions: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: fs(48, 32),
      marginTop: 0,
      paddingTop: fs(8, 4),
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 'auto',
    },
    // Decline and Answer sit out toward the edges, as on the native call screen.
    // The card centres its children, so the row must take the width itself: shrunk
    // to its contents, space-between has no room to spread into. Capped at the
    // softphone's own width so a wide host still reads as a phone, not two buttons
    // at opposite ends of a tablet.
    actionsSpread: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: D.maxWidth,
      justifyContent: 'space-between',
      paddingHorizontal: D.space * 1.5,
      gap: 72,
    },
    actionsInCall: { marginTop: 0 },
    action: {
      width: D.actionButtonSize,
      height: D.actionButtonSize,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionSuccess: { backgroundColor: p.success },
    actionDanger: { backgroundColor: p.danger },
    actionNeutral: { backgroundColor: p.surface },
    actionDisabled: { opacity: 0.4 },
    actionPressed: { opacity: 0.85 },

    screen: { flex: 1, minHeight: 0, gap: D.space },

    peer: {
      alignItems: 'center',
      justifyContent: 'center',
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      minHeight: 72,
      gap: 4,
      alignSelf: 'stretch',
      width: '100%',
    },
    peerName: {
      fontSize: fs(26, 20),
      fontWeight: '600',
      color: p.text,
      textAlign: 'center',
      alignSelf: 'stretch',
    },
    peerNumber: { fontSize: fs(15, 13), color: p.textSecondary },
    // Shrinks first when the screen runs out of height (flexShrink well above
    // its siblings'), so the avatar gives way before anything else does.
    peerAvatar: {
      height: 64,
      maxHeight: 64,
      minHeight: 0,
      flexShrink: 100,
      aspectRatio: 1,
      alignSelf: 'center',
      borderRadius: 32,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.accent,
      marginBottom: 4,
    },
    peerAvatarImage: { width: '100%', height: '100%' },
    peerAvatarInitials: { fontSize: 22, fontWeight: '600', color: p.onAccent },
    peerAvatarHidden: { backgroundColor: 'transparent' },
    peerAvatarSm: { width: 32, height: 32, flexShrink: 0, borderRadius: 16, marginBottom: 0 },
    peerAvatarInitialsSm: { fontSize: 13 },
    peerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    peerRowText: { flexShrink: 1, alignItems: 'flex-start' },
    callState: { alignItems: 'center', marginTop: 6, gap: 2 },
    dtmfReadout: {
      textAlign: 'center',
      fontSize: 22,
      minHeight: 28,
      letterSpacing: 0.08 * 22,
      color: p.text,
    },
    callStateText: { fontSize: fs(14, 12), color: p.textSecondary },
    duration: { fontSize: fs(18, 15), fontWeight: '500', color: p.text },

    incomingLabel: {
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 1.5,
      color: p.textSecondary,
    },

    controls: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignSelf: 'center',
      flexShrink: 0,
      maxWidth: (D.controlButtonSize + 12) * 3 + fs(40, 16),
      rowGap: fs(8, 4),
      columnGap: fs(20, 8),
    },
    control: { alignItems: 'center', gap: fs(6, 3), width: D.controlButtonSize + 12 },
    controlDisabled: { opacity: 0.4 },
    controlGlyphWrap: {
      width: D.controlButtonSize,
      height: D.controlButtonSize,
      borderRadius: 999,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlGlyphOn: { backgroundColor: p.accent },
    controlLabel: { fontSize: fs(12, 10), color: p.textSecondary },
    controlsSlot: { opacity: 0 },

    peerCompact: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      minHeight: 0,
      justifyContent: 'flex-end',
    },
    transfer: {
      flexDirection: 'column',
      gap: 8,
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 'auto',
      justifyContent: 'center',
      width: '100%',
      maxWidth: (D.controlButtonSize + 12) * 3 + fs(40, 16),
      alignSelf: 'center',
    },
    transferInput: {
      minHeight: fs(52, 38),
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: D.radius,
      paddingHorizontal: fs(14, 10),
      paddingVertical: fs(12, 6),
      backgroundColor: p.surface,
      color: p.text,
      fontSize: fs(16, 14),
    },
    transferActions: { flexDirection: 'row', gap: fs(8, 6) },
    transferSend: {
      flex: 1,
      backgroundColor: p.accent,
      borderRadius: D.radius,
      paddingVertical: fs(12, 8),
      alignItems: 'center',
      justifyContent: 'center',
    },
    transferSendText: { color: p.onAccent, fontWeight: '600', fontSize: fs(15, 12) },
    transferSendSecondary: { backgroundColor: p.surface },
    transferSendSecondaryText: { color: p.text, fontWeight: '600', fontSize: fs(15, 12) },
    transferSendDisabled: { opacity: 0.5 },

    consultHeld: { opacity: 0.7 },

    heldCalls: { gap: fs(8, 4) },
    heldCall: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: D.radius,
      padding: fs(14, 8),
      alignItems: 'center',
      gap: 4,
      backgroundColor: p.surface,
    },

    incomingStack: { gap: 8 },
    layoutWithBanner: { gap: D.space },

    incomingCard: {
      flex: 1,
      gap: D.space,
      alignItems: 'center',
    },
    incomingCardInfo: { minHeight: 72, justifyContent: 'center', flex: 1, minWidth: 0, gap: 2 },
    incomingCardInfoCompact: { minHeight: 0 },
    incomingLabelCompact: { textAlign: 'left', fontSize: 11 },
    incomingCardCompact: {
      flexDirection: 'row',
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 'auto',
      alignSelf: 'stretch',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: D.radius,
      backgroundColor: p.surface,
    },
    actionsCompact: {
      alignSelf: 'auto',
      width: 'auto',
      paddingHorizontal: 0,
      gap: 8,
      flex: 0,
      flexShrink: 0,
      flexBasis: 'auto',
      justifyContent: 'flex-end',
      marginTop: 0,
      paddingTop: 0,
    },
    actionCompact: { width: D.actionButtonSize * 0.72, height: D.actionButtonSize * 0.72 },
    peerNameCompact: { fontSize: fs(15, 13), fontWeight: '600', color: p.text },
    peerNumberCompact: { fontSize: fs(12, 11), color: p.textSecondary },
    // A held or transfer row's name: the title size normally, row-sized when compact.
    rowName: { fontSize: fs(26, 15), fontWeight: '600', color: p.text },

    e911: {
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 'auto',
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
      gap: fs(8, 6),
      paddingVertical: fs(12, 6),
      paddingHorizontal: fs(12, 8),
    },
    e911ToggleText: {
      color: p.warning,
      fontSize: fs(13, 11),
      fontWeight: '600',
      textAlign: 'center',
      flexShrink: 1,
    },

    e911Backdrop: {
      flex: 1,
      backgroundColor: p.background,
      justifyContent: 'flex-end',
    },
    e911ModalWrap: { width: '100%' },
    e911Sheet: {
      backgroundColor: p.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: '92%',
      paddingBottom: 8,
    },
    e911Header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
    },
    e911Title: { flex: 1, fontSize: 17, fontWeight: '700', color: p.text },
    e911Close: { fontSize: 20, color: p.textSecondary, paddingHorizontal: 4 },
    e911Scroll: { flexGrow: 0 },
    e911ScrollContent: { padding: 20, gap: 14 },
    e911Hint: { fontSize: 14, lineHeight: 20, color: p.textSecondary },
    e911Choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.background,
    },
    e911ChoiceAddr: { flex: 1, fontSize: 15, color: p.text },
    e911ChoiceCta: { fontSize: 13, fontWeight: '600', color: p.accent },

    e911LocateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: p.accent,
    },
    e911LocateBtnText: { color: p.accent, fontWeight: '600', fontSize: 15 },

    e911Field: { gap: 6 },
    e911Label: { fontSize: 13, color: p.textSecondary },
    e911Input: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: p.text,
      fontSize: 16,
      backgroundColor: p.background,
    },
    e911Error: {
      fontSize: 14,
      lineHeight: 20,
      color: p.danger,
      alignSelf: 'stretch',
      textAlign: 'left',
    },

    e911Footer: {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    e911FooterBtns: { flexDirection: 'row', gap: 12 },
    e911FooterBtn: { flex: 1 },
    e911Btn: {
      backgroundColor: p.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    e911BtnText: { color: p.onAccent, fontWeight: '600', fontSize: 16 },
    e911BtnDisabled: { opacity: 0.4 },
    e911BtnSecondary: {
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    e911BtnSecondaryText: { color: p.text, fontWeight: '600', fontSize: 16 },
  });
}
