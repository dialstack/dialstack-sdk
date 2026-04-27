/**
 * Dial Plan Graph Utilities
 *
 * Functions to transform dial plan data structures into React Flow nodes and edges.
 */

import type { Node, Edge } from '@xyflow/react';
import dagre from 'dagre';
import type { DialPlan, DialPlanNode, StartNodeData } from '../types/dial-plan';
import { DIAL_PLAN_EDGE_TYPE, type NodeTypeRegistry } from '../react/dial-plan/registry';
import { defaultRegistry } from '../react/dial-plan/default-registry';

// ============================================================================
// Constants
// ============================================================================

const START_NODE_ID = '__start__';
const START_NODE_SIZE = 60;
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 80;
export const SCHEDULE_NODE_HEIGHT = 140;

// ============================================================================
// Types
// ============================================================================

/** A React Flow node with our custom data types */
export type DialPlanGraphNode = Node<StartNodeData | Record<string, unknown>>;

export interface TransformResult {
  nodes: DialPlanGraphNode[];
  edges: Edge[];
}

// ============================================================================
// Node Label Utilities
// ============================================================================

/**
 * Get display label for a dial plan node.
 * Returns the node type name (e.g., "Schedule", "Dial") instead of node ID.
 */
export function getNodeLabel(node: DialPlanNode): string {
  switch (node.type) {
    case 'schedule':
      return 'Schedule';
    case 'internal_dial':
      return 'Internal Extension';
    case 'ring_all_users':
      return 'Ring All';
    case 'external_dial':
      return 'External Number';
    case 'menu':
      return 'IVR Menu';
    case 'sound_clip':
      return 'Sound Clip';
    default:
      return 'Node';
  }
}

/**
 * Get label for an edge based on exit type.
 */
export function getEdgeLabel(exitType: string): string {
  switch (exitType) {
    case 'open':
      return 'Open';
    case 'closed':
      return 'Closed';
    case 'next':
      return 'No Answer';
    case 'timeout':
      return 'Timeout';
    default:
      return exitType;
  }
}

// ============================================================================
// Graph Transformation
// ============================================================================

/**
 * Transform a dial plan into React Flow nodes and edges.
 */
export function transformDialPlanToGraph(
  dialPlan: DialPlan,
  registry: NodeTypeRegistry = defaultRegistry
): TransformResult {
  const nodes: DialPlanGraphNode[] = [];
  const edges: Edge[] = [];

  // Create a map of node IDs for quick lookup
  const nodeMap = new Map<string, DialPlanNode>();
  for (const node of dialPlan.nodes) {
    nodeMap.set(node.id, node);
  }

  // Add the start node
  const startNode: DialPlanGraphNode = {
    id: START_NODE_ID,
    type: 'start',
    position: { x: 0, y: 0 },
    data: { label: 'Start' },
  };
  nodes.push(startNode);

  // Add edge from start to entry node
  if (dialPlan.entry_node && nodeMap.has(dialPlan.entry_node)) {
    edges.push({
      id: `${START_NODE_ID}->${dialPlan.entry_node}`,
      source: START_NODE_ID,
      target: dialPlan.entry_node,
      type: DIAL_PLAN_EDGE_TYPE,
    });
  }

  // Process each node in the dial plan
  for (const node of dialPlan.nodes) {
    const reg = registry.resolveType(node);
    const position = node.position ?? { x: 0, y: 0 };

    if (reg) {
      const data = reg.toFlowNode(node);
      const flowNode: DialPlanGraphNode = {
        id: node.id,
        type: reg.flowType,
        position,
        data,
      };
      nodes.push(flowNode);
    } else {
      // Fallback for unknown types
      nodes.push({
        id: node.id,
        type: 'default',
        position,
        data: { label: node.id, originalNode: node },
      });
    }

    // Create edges using registry
    const nodeEdges = registry.createEdgesForNode(node, nodeMap);
    edges.push(...nodeEdges);
  }

  // Apply auto-layout if any nodes don't have positions
  const needsLayout = dialPlan.nodes.some((n) => !n.position);
  if (needsLayout) {
    return applyAutoLayout(nodes, edges);
  }

  return { nodes, edges };
}

/**
 * Transform React Flow nodes and edges back to DialPlanData.
 */
export function transformGraphToDialPlan(
  nodes: Node[],
  edges: Edge[],
  registry: NodeTypeRegistry
): {
  entry_node: string;
  nodes: Array<{
    id: string;
    type: string;
    position?: { x: number; y: number };
    config: Record<string, unknown>;
  }>;
} {
  // Find entry node from start edge
  const startEdge = edges.find((e) => e.source === START_NODE_ID);
  const entryNode = startEdge?.target ?? '';

  // Convert flow nodes back to API nodes (skip start)
  const dialPlanNodes: Array<{
    id: string;
    type: string;
    position?: { x: number; y: number };
    config: Record<string, unknown>;
  }> = [];
  for (const node of nodes) {
    if (node.id === START_NODE_ID) continue;

    const reg = registry.getByFlowType(node.type ?? '');
    if (!reg || !node.data?.originalNode) continue;

    const originalNode = node.data.originalNode as DialPlanNode;
    // Start with original config, then rebuild exit connections from edges
    const config = { ...(originalNode.config as unknown as Record<string, unknown>) };

    // Clear all exit config keys first
    for (const exit of reg.exits) {
      config[exit.configKey] = undefined;
    }
    // Set from edges
    for (const edge of edges) {
      if (edge.source !== node.id) continue;
      const exit = reg.exits.find((e) => e.id === edge.sourceHandle);
      if (exit) {
        config[exit.configKey] = edge.target;
      }
    }

    // Let registrations with dynamic exits override config serialization
    const finalConfig = reg.serializeConfig ? reg.serializeConfig(node, edges, config) : config;

    dialPlanNodes.push({
      id: node.id,
      type: reg.apiType ?? originalNode.type,
      position: node.position,
      config: finalConfig,
    });
  }

  return { entry_node: entryNode, nodes: dialPlanNodes };
}

// ============================================================================
// Auto Layout
// ============================================================================

function nodeDimensions(node: DialPlanGraphNode): { width: number; height: number } {
  // Use React Flow's measured dimensions when available (after first render)
  if (node.measured?.width && node.measured?.height)
    return { width: node.measured.width, height: node.measured.height };
  // Fallback to estimates for initial layout (before first render)
  if (node.type === 'start') return { width: START_NODE_SIZE, height: START_NODE_SIZE };
  if (node.type === 'schedule') return { width: NODE_WIDTH, height: SCHEDULE_NODE_HEIGHT };
  if (node.type === 'menu') {
    const options = (node.data as Record<string, unknown>).options as unknown[] | undefined;
    const exitCount = (options?.length ?? 1) + 2; // digits + timeout + invalid
    return { width: NODE_WIDTH, height: 60 + exitCount * 28 };
  }
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}

/**
 * Apply dagre auto-layout to position nodes.
 */
export function applyAutoLayout(nodes: DialPlanGraphNode[], edges: Edge[]): TransformResult {
  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir: 'LR', // Left to right
    nodesep: 60, // Vertical separation between nodes
    ranksep: 80, // Horizontal separation between ranks
    marginx: 40,
    marginy: 40,
  });

  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to dagre graph
  for (const node of nodes) {
    const { width, height } = nodeDimensions(node);
    g.setNode(node.id, { width, height });
  }

  // Add edges to dagre graph
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Run the layout algorithm
  dagre.layout(g);

  // Calculate dagre positions (center-anchor → top-left)
  const dagrePositions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const nodeWithPosition = g.node(node.id);
    const { width, height } = nodeDimensions(node);
    dagrePositions.set(node.id, {
      x: Math.round(nodeWithPosition.x - width / 2),
      y: Math.round(nodeWithPosition.y - height / 2),
    });
  }

  // Fix edge crossing from ordered exits (e.g. Schedule: open above closed).
  // Swap entire subtrees so the exit order matches the Y ordering.
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.source);
    if (list) list.push(edge.target);
    else adjacency.set(edge.source, [edge.target]);
  }

  const descendants = (rootId: string): Set<string> => {
    const visited = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const child of adjacency.get(id) ?? []) {
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
      }
    }
    return visited;
  };

  for (const node of nodes) {
    const reg = defaultRegistry.getByFlowType(node.type ?? '');
    if (!reg || reg.exits.length < 2) continue;

    const targets: string[] = [];
    for (const exit of reg.exits) {
      const edge = edges.find((e) => e.source === node.id && e.sourceHandle === exit.id);
      if (edge) targets.push(edge.target);
    }
    if (targets.length < 2) continue;

    // Compare first two targets (exit order: top to bottom in DOM)
    const topTarget = targets[0]!;
    const bottomTarget = targets[1]!;
    const topPos = dagrePositions.get(topTarget);
    const bottomPos = dagrePositions.get(bottomTarget);
    if (!topPos || !bottomPos) continue;

    // Already in correct order
    if (topPos.y <= bottomPos.y) continue;

    const topGroup = descendants(topTarget);
    const bottomGroup = descendants(bottomTarget);

    // Skip if subtrees share nodes (diamond/merge topology)
    if ([...topGroup].some((id) => bottomGroup.has(id))) continue;

    // Swap the two subtrees by shifting each by the Y difference
    const delta = topPos.y - bottomPos.y;
    for (const id of topGroup) {
      const pos = dagrePositions.get(id);
      if (pos) pos.y -= delta;
    }
    for (const id of bottomGroup) {
      const pos = dagrePositions.get(id);
      if (pos) pos.y += delta;
    }
  }

  // Anchor layout to the start node's current position
  const startNode = nodes.find((n) => n.id === START_NODE_ID);
  const startDagre = dagrePositions.get(START_NODE_ID);
  const offsetX = startNode && startDagre ? startNode.position.x - startDagre.x : 0;
  const offsetY = startNode && startDagre ? startNode.position.y - startDagre.y : 0;

  const positionedNodes = nodes.map((node) => {
    const pos = dagrePositions.get(node.id)!;
    return {
      ...node,
      position: {
        x: pos.x + offsetX,
        y: pos.y + offsetY,
      },
    };
  });

  return { nodes: positionedNodes, edges };
}
