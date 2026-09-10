import type { DialPlanLocale, DialPlanNode } from '@dialstack/sdk-js';
import { defaultRegistry, nodeDefinitions } from './default-registry';
import { resolveTargetType } from './nodes/resolve-target';
import type { ResourceMaps } from './registry-types';

/**
 * The flow-node data a config edit produces.
 *
 * An edit rebuilds `data` from the node's stored config via `toFlowNode`, which
 * knows nothing about the resources the node references. So every display field
 * the canvas derives from a resolved resource has to be derived again here, or
 * it reverts to the stored value — for an Internal Extension node that means
 * the badge printing the raw number instead of what the call will do.
 *
 * Returns `null` when the node carries no stored node to update, which leaves
 * the caller's node untouched.
 */
export function nodeDataAfterConfigChange({
  flowType,
  data,
  configUpdates,
  displayUpdates,
  maps,
  locale,
}: {
  flowType: string;
  data: Record<string, unknown>;
  configUpdates: Record<string, unknown>;
  displayUpdates?: Record<string, unknown>;
  maps: ResourceMaps;
  locale: DialPlanLocale;
}): Record<string, unknown> | null {
  const originalNode = data.originalNode as Record<string, unknown> | undefined;
  if (!originalNode) return null;

  const updatedOriginal = {
    ...originalNode,
    config: { ...(originalNode.config as Record<string, unknown>), ...configUpdates },
  };

  const reg = defaultRegistry.getByFlowType(flowType);
  const freshData = reg
    ? reg.toFlowNode(updatedOriginal as unknown as DialPlanNode)
    : { ...data, originalNode: updatedOriginal };

  const targetId = configUpdates.target_id as string | undefined;
  const targetType = targetId ? resolveTargetType(targetId, locale) : undefined;

  const def = reg ? nodeDefinitions.find((d) => d.type === (reg.apiType ?? reg.type)) : null;
  const merged = { ...data, ...freshData };
  const enriched = def?.enrichNode ? def.enrichNode(merged, maps, locale) : merged;

  // The panel's own display updates win over enrichment: they carry the name of
  // a resource just picked, which the resolved maps cannot know yet.
  return { ...enriched, ...displayUpdates, ...(targetType && { targetType }) };
}

/** Re-derive a node's display fields from the currently resolved resources. */
export function enrichNodeData(
  flowType: string,
  data: Record<string, unknown>,
  maps: ResourceMaps,
  locale: DialPlanLocale
): Record<string, unknown> {
  const reg = defaultRegistry.getByFlowType(flowType);
  const def = reg ? nodeDefinitions.find((d) => d.type === (reg.apiType ?? reg.type)) : null;
  return def?.enrichNode ? def.enrichNode(data, maps, locale) : data;
}
