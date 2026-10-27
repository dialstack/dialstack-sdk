import React from 'react';
import { Text, View } from 'react-native';
import {
  contactDetail,
  directoryContactTags,
  type DirectoryContact,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import type { makeStyles } from '../primitives';
import { PresenceBadge } from './PresenceBadge';

/**
 * A contact's name, tags, number and presence, as the directory lists it, as a
 * panel shows it once picked, and as a match chip above a number field, so the
 * three can't drift apart. `inline` puts it on one line for the chip row,
 * where the number is the point, so it shows over any description.
 */
export function DirectoryContactView({
  palette,
  styles,
  t,
  entry,
  inline = false,
}: {
  palette: SoftphonePalette;
  styles: ReturnType<typeof makeStyles>;
  t: (key: keyof Locale['softphone']) => string;
  entry: DirectoryContact;
  inline?: boolean;
}): React.JSX.Element {
  const title = (
    <>
      {entry.presence && (
        <PresenceBadge palette={palette} styles={styles} presence={entry.presence} />
      )}
      <Text style={[styles.directoryOptionLabel, inline && styles.dialMatchText]}>
        {entry.label}
      </Text>
      {directoryContactTags(entry).map((tag, j) => (
        <View key={`${tag}|${j}`} style={styles.directoryTag}>
          <Text style={styles.directoryTagText}>{tag}</Text>
        </View>
      ))}
    </>
  );
  const detail = (
    <Text style={[styles.directoryOptionDetail, inline && styles.dialMatchText]}>
      {contactDetail(entry, inline, t)}
    </Text>
  );
  if (inline) {
    return (
      <>
        {title}
        {detail}
      </>
    );
  }
  return (
    <>
      <View style={styles.directoryOptionTitle}>{title}</View>
      {detail}
    </>
  );
}
