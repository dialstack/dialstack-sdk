import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import type { SoftphonePalette } from '@dialstack/sdk-react/core';

import { makeStyles } from '../primitives';
import type { PeerSummary } from './OngoingCallView';

// One sheet per palette, shared by every avatar and row, rather than a full
// softphone sheet built per held-call or transfer row.
const sheets = new WeakMap<SoftphonePalette, ReturnType<typeof makeStyles>>();
function stylesFor(palette: SoftphonePalette) {
  let sheet = sheets.get(palette);
  if (!sheet) {
    sheet = makeStyles(palette);
    sheets.set(palette, sheet);
  }
  return sheet;
}

/**
 * The host's avatar for a peer (`resolvePeer`): an image, else initials, on the
 * accent disc. `sm` is the inline size for one-line rows (call waiting, held
 * calls, transfer, the keypad header).
 */
export function PeerAvatar({
  palette,
  avatar,
  size = 'lg',
}: {
  palette: SoftphonePalette;
  avatar: PeerSummary['avatar'];
  size?: 'lg' | 'sm';
}): React.JSX.Element | null {
  const styles = stylesFor(palette);
  // The large avatar shrinks with the screen (styles.peerAvatar); its laid-out
  // height sizes the initials, and below a legible size the disc hides rather
  // than turning into a dot. The box keeps its slot, so hiding cannot re-flow it.
  const [height, setHeight] = useState<number>(64);
  // An image that fails to load falls back to the initials, or to no avatar.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (!avatar) return null;
  const image = avatar.uri && avatar.uri !== failedUri ? avatar.uri : null;
  if (!image && !avatar.initials) return null;
  const sm = size === 'sm';
  const visible = sm || height >= MIN_AVATAR;
  return (
    <View
      style={[styles.peerAvatar, sm && styles.peerAvatarSm, !visible && styles.peerAvatarHidden]}
      onLayout={sm ? undefined : (e) => setHeight(e.nativeEvent.layout.height)}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {visible &&
        (image ? (
          <Image
            source={{ uri: image }}
            style={styles.peerAvatarImage}
            onError={() => setFailedUri(image)}
          />
        ) : (
          <Text
            style={[
              styles.peerAvatarInitials,
              sm ? styles.peerAvatarInitialsSm : { fontSize: Math.round(height * 0.34) },
            ]}
          >
            {avatar.initials}
          </Text>
        ))}
    </View>
  );
}

const MIN_AVATAR = 40;

/** A row's name block with the peer's small avatar beside it, when there is one. */
export function PeerRow({
  palette,
  avatar,
  children,
}: {
  palette: SoftphonePalette;
  avatar: PeerSummary['avatar'];
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = stylesFor(palette);
  if (!avatar) return <>{children}</>;
  return (
    <View style={styles.peerRow}>
      <PeerAvatar palette={palette} avatar={avatar} size="sm" />
      <View style={styles.peerRowText}>{children}</View>
    </View>
  );
}
