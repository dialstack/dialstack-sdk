/**
 * The canvas badge is a promise about the call. It prints nothing rather than a
 * number the call ignores, and the thing that makes a number inert is the
 * target owning timing of its own — not the override being off.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { defaultDialPlanLocale } from '../../../locales/dial-plan-en';
import { config } from '../nodes/InternalDialNode';
import type { NodeTypeRegistration, ResourceMaps } from '../registry-types';

const maps = (targetId: string, ownTimeout?: number): ResourceMaps => ({
  schedules: new Map(),
  audioClips: new Map(),
  users: new Map([[targetId, { id: targetId, timeout_seconds: ownTimeout }]]),
});

const badge = (
  targetId: string,
  timeout: number | undefined,
  timeoutOverride: boolean,
  ownTimeout?: number
) => {
  const data = config.enrichNode!(
    { label: 'Internal Extension', targetId, timeout, timeoutOverride },
    maps(targetId, ownTimeout),
    defaultDialPlanLocale
  );
  render(
    <ReactFlowProvider>
      {config.renderNode(data, config as unknown as NodeTypeRegistration)}
    </ReactFlowProvider>
  );
  return screen.getByText('Internal Extension', { exact: false });
};

describe('InternalDialNode', () => {
  it('enables the timeout override in the config for a newly added node', () => {
    expect(config.defaultConfig).toMatchObject({ timeout: 30, timeout_override: true });
  });

  it('omits a number the target overrules', () => {
    const label = badge('qu_1', 45, false, 300);
    expect(label).toHaveTextContent('Internal Extension');
    expect(label).not.toHaveTextContent('(45s)');
  });

  it('prints the stored number when the target owns no timing', () => {
    // A user with no Find Me / Follow Me ladder: dialNodeRingTimeout is
    // unconditional, so these 45 seconds are what the devices ring for.
    expect(badge('user_1', 45, false)).toHaveTextContent('Internal Extension (45s)');
  });

  it('prints the skip sentinel whatever the target owns', () => {
    expect(badge('qu_1', 0, false, 300)).toHaveTextContent('Internal Extension (0s)');
  });

  it('shows the active timeout while the override is on', () => {
    expect(badge('qu_1', 45, true, 300)).toHaveTextContent('Internal Extension (45s)');
  });
});
