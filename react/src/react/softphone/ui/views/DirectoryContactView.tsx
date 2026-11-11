import React from 'react';
import { contactDetail, directoryContactTags, type DirectoryContact } from '../../core/view-model';
import { PresenceBadge } from '../../../call-ui/PresenceBadge';
import type { SoftphoneViewChrome } from './types';

/**
 * A contact's name, tags, number and presence, as the directory lists it, as a
 * panel shows it once picked, and as a match chip above a number field, so the
 * three can't drift apart. `inline` puts it on one line for the chip row,
 * where the number is the point, so it shows over any description.
 */
export const DirectoryContactView: React.FC<
  Pick<SoftphoneViewChrome, 't' | 'displayNumber'> & { entry: DirectoryContact; inline?: boolean }
> = ({ entry, t, displayNumber, inline = false }) => {
  const title = (
    <>
      {entry.presence && <PresenceBadge presence={entry.presence} />}
      <span className="ds-directory-option-label">{entry.label}</span>
      {directoryContactTags(entry).map((tag, j) => (
        <span key={`${tag}|${j}`} className="ds-directory-tag">
          {tag}
        </span>
      ))}
    </>
  );
  const detail = (
    <span className="ds-directory-option-detail">
      {contactDetail(entry, inline, t, displayNumber)}
    </span>
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
      <span className="ds-directory-option-title">{title}</span>
      {detail}
    </>
  );
};
