import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { dialPadKeys, softphoneDimensions } from '@dialstack/sdk-react/core';
import { chunk, type makeStyles } from '../primitives';

// The full-size key and gap, in every size tier: a narrow host gets keys as
// large as its width allows rather than a fixed compact size.
const FULL_KEY = Math.round(softphoneDimensions.keyMaxSize * 1.1);
const GAP_RATIO = softphoneDimensions.keyGap / FULL_KEY;
// The `compact` cap, also tier-independent (it matches keyCompact at full size).
const COMPACT_KEY = 76;

export interface KeypadViewProps {
  styles: ReturnType<typeof makeStyles>;
  onKey: (digit: string) => void;
  /** A key's accessible name; defaults to the digit and its letters. */
  keyLabel?: (key: { digit: string; letters: string }) => string;
  /** Caps the keys at the compact size even when there is room for more. */
  compact?: boolean;
}

/**
 * The 12-key pad, shared by the dial pad and the in-call keypad so they look
 * and size the same. The keys fit the keypad's height as well as its width, so
 * whatever sits above them (the E911 banner, the directory matches) can take
 * room without the rows running into each other; an aspect ratio alone only
 * follows width. They stay one centred 3x4 block whose gaps scale with the
 * keys, so a smaller keypad keeps the same proportions instead of spreading out.
 */
export function KeypadView({
  styles,
  onKey,
  keyLabel = ({ digit, letters }) => `${digit}${letters ? ' ' + letters : ''}`,
  compact = false,
}: KeypadViewProps): React.JSX.Element {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const keyMax = compact ? Math.min(COMPACT_KEY, FULL_KEY) : FULL_KEY;
  const size = box
    ? Math.floor(Math.min(keyMax, box.w / (3 + 2 * GAP_RATIO), box.h / (4 + 3 * GAP_RATIO)))
    : undefined;
  const gap = size !== undefined ? Math.round(size * GAP_RATIO) : undefined;

  return (
    <View
      style={[
        styles.keypad,
        {
          maxWidth: FULL_KEY * (3 + 2 * GAP_RATIO),
          // Sized by the space it is given, not by its keys: a box that
          // followed the keys would change once they are sized, and need a
          // second pass. The basis is the full-size keypad, as on web.
          flexBasis: FULL_KEY * (4 + 3 * GAP_RATIO),
          minHeight: 0,
          // It gives up height before anything beside it: the caller's name or
          // the number shrinking under their text is what spills, not keys.
          flexShrink: 1000,
        },
        gap !== undefined && { gap },
        // Hidden for the one frame before the box is measured, rather than
        // drawn at a guessed size and then resized.
        size === undefined && { opacity: 0 },
      ]}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setBox((prev) =>
          prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }
        );
      }}
    >
      {chunk(dialPadKeys, 3).map((row, i) => (
        <View
          key={i}
          style={[styles.keyRow, gap !== undefined && { gap, justifyContent: 'center' }]}
        >
          {row.map((key) => (
            <Pressable
              key={key.digit}
              onPress={() => onKey(key.digit)}
              accessibilityLabel={keyLabel(key)}
              style={({ pressed }: { pressed: boolean }) => [
                styles.key,
                compact && styles.keyCompact,
                size !== undefined && {
                  flexGrow: 0,
                  flexShrink: 0,
                  flexBasis: 'auto',
                  width: size,
                  height: size,
                  maxWidth: size,
                  maxHeight: size,
                },
                pressed && styles.keyPressed,
              ]}
            >
              <Text
                style={[
                  styles.keyDigit,
                  size !== undefined && {
                    fontSize: Math.min(26, Math.round(size * 0.32)),
                    lineHeight: Math.min(30, Math.round(size * 0.37)),
                  },
                ]}
              >
                {key.digit}
              </Text>
              <Text
                style={[
                  styles.keyLetters,
                  size !== undefined && { fontSize: Math.min(10, Math.round(size * 0.13)) },
                ]}
              >
                {key.letters || ' '}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}
