import React from 'react';
import type { Edge } from '@xyflow/react';
import type {
  DialPlanLocale,
  DialPlanNode,
  MenuOption,
  MenuNode as MenuNodeType,
} from '../../../types/dial-plan';
import type {
  ConfigChangeContext,
  NodeDefinition,
  NodeTypeRegistration,
  ResourceCollector,
  ResourceMaps,
} from '../registry-types';
import { NodeHeader, ExitRow, StaticExits } from '../DialPlanNode';
import { DIAL_PLAN_EDGE_TYPE } from '../registry';
import { MenuConfigPanel } from '../config-panels/MenuConfigPanel';
import { digitToHandleId, handleIdToDigit } from '../menu-utils';
import { GridIcon } from '../icons';

const exits = [
  { id: 'timeout', label: 'Timeout', configKey: 'timeout_next_node', localeExitKey: 'timeout' },
  { id: 'invalid', label: 'Invalid', configKey: 'invalid_next_node', localeExitKey: 'invalid' },
] as const;

export const config: NodeDefinition = {
  type: 'menu',
  flowType: 'menu',
  localeKey: 'menu',
  label: 'IVR Menu',
  description: 'Play prompt and route by keypress',
  color: '#ec4899',
  exits: [...exits],
  allowSelfLoop: true,
  configPanel: MenuConfigPanel,
  defaultConfig: { prompt_clip_id: '', timeout: 5, options: [{ digit: '1' }] },
  icon: GridIcon,
  renderNode: (data: Record<string, unknown>, reg: NodeTypeRegistration) => {
    const options = (data.options as MenuOption[]) ?? [];
    const locale = data.locale as DialPlanLocale | undefined;
    return (
      <>
        <NodeHeader
          icon={reg.icon}
          label={data.label as string}
          timeout={data.timeout as number | undefined}
          subtitle={data.promptClipName as string | undefined}
        />
        <div className="ds-dial-plan-node__exits">
          {options.map((opt) => (
            <ExitRow
              key={opt.digit}
              id={digitToHandleId(opt.digit)}
              label={opt.digit === '*' ? '✱' : opt.digit === '#' ? '#' : opt.digit}
            />
          ))}
          <StaticExits exits={reg.exits} locale={locale} />
        </div>
      </>
    );
  },
  toFlowNode: (node: DialPlanNode) => {
    const n = node as MenuNodeType;
    return {
      label: 'IVR Menu',
      promptClipId: n.config.prompt_clip_id,
      timeout: n.config.timeout,
      options: n.config.options,
      originalNode: n,
    };
  },
  createEdgesForNode: (node: DialPlanNode, nodeMap: Map<string, DialPlanNode>): Edge[] => {
    const n = node as MenuNodeType;
    const edges: Edge[] = [];
    if (n.config.timeout_next_node && nodeMap.has(n.config.timeout_next_node)) {
      edges.push({
        id: `${n.id}-timeout->${n.config.timeout_next_node}`,
        source: n.id,
        target: n.config.timeout_next_node,
        sourceHandle: 'timeout',
        type: DIAL_PLAN_EDGE_TYPE,
      });
    }
    if (n.config.invalid_next_node && nodeMap.has(n.config.invalid_next_node)) {
      edges.push({
        id: `${n.id}-invalid->${n.config.invalid_next_node}`,
        source: n.id,
        target: n.config.invalid_next_node,
        sourceHandle: 'invalid',
        type: DIAL_PLAN_EDGE_TYPE,
      });
    }
    for (const opt of n.config.options) {
      if (opt.next_node && nodeMap.has(opt.next_node)) {
        const handleId = digitToHandleId(opt.digit);
        edges.push({
          id: `${n.id}-${handleId}->${opt.next_node}`,
          source: n.id,
          target: opt.next_node,
          sourceHandle: handleId,
          type: DIAL_PLAN_EDGE_TYPE,
        });
      }
    }
    return edges;
  },
  collectResourceIds: (config: Record<string, unknown>, collector: ResourceCollector) => {
    if (config.prompt_clip_id) collector.addAudioClip(config.prompt_clip_id as string);
  },
  enrichNode: (data: Record<string, unknown>, maps: ResourceMaps, locale: DialPlanLocale) => {
    const clip = maps.audioClips.get(data.promptClipId as string);
    return { ...data, promptClipName: clip?.name, locale };
  },
  resolveExitLabel: (handleId: string) => {
    const digit = handleIdToDigit(handleId);
    if (digit) return digit === '*' ? '✱' : digit;
    return undefined;
  },
  onConfigChange: (
    nodeId: string,
    configUpdates: Record<string, unknown>,
    ctx: ConfigChangeContext
  ) => {
    if (!configUpdates.options) return;
    const newOptions = configUpdates.options as Array<{ digit: string }>;
    const newHandles = new Set(newOptions.map((o) => digitToHandleId(o.digit)));
    for (const exit of exits) newHandles.add(exit.id);

    // Get previous options from current node data to detect digit renames
    const node = ctx.nodesRef.current.find((n) => n.id === nodeId);
    const prevOptions =
      ((node?.data as Record<string, unknown>)?.options as Array<{ digit: string }>) ?? [];

    // Digit rename: same length, same index, different digit. On add/remove
    // the index pairing is meaningless (indices shift), so only remap when
    // length is unchanged — otherwise edges for removed digits would be
    // rewired onto the next digit's handle.
    const handleRemap = new Map<string, string>();
    if (prevOptions.length === newOptions.length) {
      for (let i = 0; i < newOptions.length; i++) {
        const oldHandle = digitToHandleId(prevOptions[i]!.digit);
        const newHandle = digitToHandleId(newOptions[i]!.digit);
        if (oldHandle !== newHandle) {
          handleRemap.set(oldHandle, newHandle);
        }
      }
    }

    ctx.setEdges((prev) => {
      const next = prev
        .map((e) => {
          if (e.source !== nodeId || !e.sourceHandle) return e;
          // Remap renamed digit handles
          const remapped = handleRemap.get(e.sourceHandle);
          if (remapped) {
            return { ...e, sourceHandle: remapped, id: `${nodeId}-${remapped}->${e.target}` };
          }
          return e;
        })
        .filter((e) => e.source !== nodeId || !e.sourceHandle || newHandles.has(e.sourceHandle));
      if (next.length !== prev.length || handleRemap.size > 0) {
        ctx.updateDirty(ctx.nodesRef.current, next);
      }
      return next;
    });
    requestAnimationFrame(() => ctx.updateNodeInternals(nodeId));
  },
  serializeConfig: (node, edges, baseConfig) => {
    const options = (baseConfig.options as Array<{ digit: string }>) ?? [];
    const rebuilt = options.map((opt) => {
      const handleId = digitToHandleId(opt.digit);
      const edge = edges.find((e) => e.source === node.id && e.sourceHandle === handleId);
      return edge ? { digit: opt.digit, next_node: edge.target } : { digit: opt.digit };
    });
    return { ...baseConfig, options: rebuilt };
  },
};
