import React from 'react';
import { softphoneGlyphs } from '../../core/icons';
import type { DirectoryContact } from '../../core/view-model';
import { Glyph } from '../../../call-ui/Glyph';
import { DirectoryContactView } from './DirectoryContactView';
import type { SoftphoneViewChrome } from './types';

/** The contact a panel will act on, in place of the field or list it came from. */
export const PickedTargetView: React.FC<
  Pick<SoftphoneViewChrome, 't' | 'displayNumber'> & {
    entry: DirectoryContact;
    onClear: () => void;
  }
> = ({ entry, onClear, t, displayNumber }) => (
  <div className="ds-dial-pick">
    <div className="ds-dial-pick-contact">
      <DirectoryContactView entry={entry} t={t} displayNumber={displayNumber} />
    </div>
    <button
      type="button"
      className="ds-dial-pick-clear"
      aria-label={t('directoryClearPick')}
      onClick={onClear}
    >
      <Glyph glyph={softphoneGlyphs.close} />
    </button>
  </div>
);
