import React from 'react';
import { Text, View } from 'react-native';
import type { SoftphonePalette } from '@dialstack/sdk-react/core';

export const HOST_SIZES = {
  default: { w: 320, h: 568 },
  tall: { w: 320, h: 760 },
  short: { w: 320, h: 420 },
  narrow: { w: 260, h: 568 },
  wide: { w: 560, h: 568 },
  small: { w: 260, h: 420 },
} as const;

export type HostSize = { w: number; h: number };

export function SoftphoneFrame({
  label,
  palette,
  size = HOST_SIZES.default,
  children,
}: {
  label: string;
  palette: SoftphonePalette;
  size?: HostSize;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', opacity: 0.6, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
      <View
        style={{
          width: size.w,
          height: size.h,
          padding: 16,
          gap: 16,
          overflow: 'hidden',
          backgroundColor: palette.background,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: 'rgba(128,128,128,0.35)',
        }}
      >
        {children}
      </View>
    </View>
  );
}
