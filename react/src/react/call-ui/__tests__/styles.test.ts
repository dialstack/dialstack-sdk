import { buildSoftphoneStyles } from '../../softphone/core/styles';
import { resolveCallPalette } from '../core/palette';
import {
  actionButtonRules,
  controlButtonRules,
  focusRingRules,
  paletteVariables,
  peerAvatarRules,
  presenceBadgeRules,
} from '../styles';

const palette = resolveCallPalette({ theme: 'light' });
const scope = 'ds-softphone';

const fragments: Record<string, string> = {
  paletteVariables: paletteVariables(palette),
  actionButtonRules: actionButtonRules(scope),
  controlButtonRules: controlButtonRules(scope),
  peerAvatarRules: peerAvatarRules(scope),
  presenceBadgeRules: presenceBadgeRules(scope),
  focusRingRules: focusRingRules(scope),
};

describe('call UI style fragments', () => {
  // Each fragment is written between two newlines that `slice(1, -1)` drops. A
  // fragment edited to start on the backtick's line would silently lose its
  // first character instead.
  it.each(Object.entries(fragments))('%s keeps its first and last character', (_name, css) => {
    expect(css).toMatch(/^ {4,}\S/);
    expect(css).toMatch(/[;}]$/);
  });

  it.each(Object.entries(fragments))('the softphone stylesheet carries %s', (_name, css) => {
    expect(buildSoftphoneStyles(palette, scope)).toContain(css);
  });
});
