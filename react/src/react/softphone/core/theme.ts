/**
 * The softphone's design tokens: the shared call UI palette under the names the
 * softphone and its React Native counterpart import, plus the sizes only the
 * softphone has (its card, its dial pad).
 */
import { callDimensions } from '../../call-ui/core/palette';

export {
  resolveCallPalette as resolveSoftphonePalette,
  callFontFamily as softphoneFontFamily,
} from '../../call-ui/core/palette';
export type { CallPalette as SoftphonePalette } from '../../call-ui/core/palette';

export const softphoneDimensions = {
  maxWidth: 420,
  defaultHeight: 644,
  ...callDimensions,
  keyGap: 14,
  keyMaxSize: 84,
  space: 16,
} as const;

export type SoftphoneDimensions = typeof softphoneDimensions;

export const dialPadKeys: ReadonlyArray<{ digit: string; letters: string }> = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];
