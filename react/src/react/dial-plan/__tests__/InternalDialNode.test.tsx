/**
 * The canvas badge is a promise about the call. It prints nothing rather than a
 * number the call ignores, and the thing that makes a number inert is the
 * target owning timing of its own — not the override being off.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider, type Edge, type Node } from '@xyflow/react';
import type { DialPlanNode } from '@dialstack/sdk-js';
import { defaultDialPlanLocale } from '../../../locales/dial-plan-en';
import { config } from '../nodes/InternalDialNode';
import { defaultRegistry } from '../default-registry';
import { hiddenExitIds } from '../registry';
import type { NodeTypeRegistration, ResourceMaps } from '../registry-types';
import { transformGraphToDialPlan } from '../../../utils/dial-plan-graph';

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

describe('InternalDialNode dial plan target', () => {
  const render_ = (data: Record<string, unknown>) =>
    render(
      <ReactFlowProvider>
        {config.renderNode(
          config.enrichNode!(
            { label: 'Internal Extension', ...data },
            maps(data.targetId as string),
            defaultDialPlanLocale
          ),
          config as unknown as NodeTypeRegistration
        )}
      </ReactFlowProvider>
    );

  it('shows no timeout and no exit, even for a stored skip', () => {
    render_({ targetId: 'dp_1', timeout: 0, timeoutOverride: false });
    expect(screen.getByText('Internal Extension', { exact: false })).not.toHaveTextContent('(0s)');
    expect(screen.queryByText(defaultDialPlanLocale.exits.timeout)).not.toBeInTheDocument();
  });

  it('keeps the exit for any other target', () => {
    render_({ targetId: 'user_1', timeout: 30, timeoutOverride: false });
    expect(screen.getByText(defaultDialPlanLocale.exits.timeout)).toBeInTheDocument();
  });

  const node = (target: string, next = 'n2'): DialPlanNode =>
    ({
      id: 'n1',
      type: 'internal_dial',
      config: { target, target_id: target, timeout: 30, next },
    }) as unknown as DialPlanNode;
  const nodeMap = new Map<string, DialPlanNode>([['n2', node('user_2')]]);
  const reg = defaultRegistry.get('internal_dial')!;

  it('draws no edge from a stored next under a dial plan target', () => {
    expect(defaultRegistry.createEdgesForNode(node('dp_1'), nodeMap)).toEqual([]);
  });

  it('draws the next edge for any other target', () => {
    expect(defaultRegistry.createEdgesForNode(node('user_1'), nodeMap)).toEqual([
      expect.objectContaining({ source: 'n1', target: 'n2', sourceHandle: 'next' }),
    ]);
  });

  it('hides the Timeout exit only for a dial plan target', () => {
    expect(hiddenExitIds(reg, { target: 'dp_1' })).toEqual(new Set(['next']));
    expect(hiddenExitIds(reg, { target: 'user_1' })).toEqual(new Set());
  });

  // An edge left over from before the target changed must not be saved as a
  // `next` that routing never reads.
  it('saves no next under a dial plan target, even with an edge on the handle', () => {
    const flow = (target: string): Node[] => [
      {
        id: 'n1',
        type: reg.flowType,
        position: { x: 0, y: 0 },
        data: { originalNode: node(target) },
      },
    ];
    const edges: Edge[] = [{ id: 'a', source: 'n1', target: 'n2', sourceHandle: 'next' }];
    const saved = (target: string) =>
      transformGraphToDialPlan(flow(target), edges, defaultRegistry).nodes[0]!.config;
    expect(saved('dp_1').next).toBeUndefined();
    expect(saved('user_1').next).toBe('n2');
  });

  it('leaves the Voicemail node, which shares the wire type, with no hidden exit', () => {
    const voicemail = defaultRegistry.get('voicemail')!;
    expect(hiddenExitIds(voicemail, { target: 'dp_1' })).toEqual(new Set());
  });
});

// The Voicemail node is stored as internal_dial with timeout 0 and no next. A
// dial plan target with a stored 0 matches that shape but is a hand-off.
describe('loading an internal_dial with timeout 0 and no next', () => {
  const load = (target: string) =>
    defaultRegistry.resolveType({
      id: 'n1',
      type: 'internal_dial',
      config: { target, target_id: target, timeout: 0 },
    } as unknown as DialPlanNode)?.type;

  it('keeps a dial plan target as an Internal Extension node', () => {
    expect(load('dp_1')).toBe('internal_dial');
  });

  it('still loads the Voicemail node shape as Voicemail', () => {
    expect(load('user_1')).toBe('voicemail');
    expect(load('svm_1')).toBe('voicemail');
  });
});
