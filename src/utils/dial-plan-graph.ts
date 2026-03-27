/**
 * Dial Plan Graph Utilities
 *
 * Functions to transform dial plan data structures into React Flow nodes and edges.
 */

import type { Node, Edge } from '@xyflow/react';
import dagre from 'dagre';
import type { DialPlan, DialPlanNode, StartNodeData } from '../types/dial-plan';
import type { NodeTypeRegistry } from '../react/dial-plan/registry';
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
      return 'Dial';
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
    width: START_NODE_SIZE,
    height: START_NODE_SIZE,
    data: { label: 'Start' },
  };
  nodes.push(startNode);

  // Add edge from start to entry node
  if (dialPlan.entry_node && nodeMap.has(dialPlan.entry_node)) {
    edges.push({
      id: `${START_NODE_ID}->${dialPlan.entry_node}`,
      source: START_NODE_ID,
      target: dialPlan.entry_node,
      type: 'smoothstep',
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
        width: NODE_WIDTH,
        height: reg.flowType === 'schedule' ? SCHEDULE_NODE_HEIGHT : NODE_HEIGHT,
        data,
      };
      nodes.push(flowNode);
    } else {
      // Fallback for unknown types
      nodes.push({
        id: node.id,
        type: 'default',
        position,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
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

    // Strip timeout/next for terminal targets (va_, dp_, svm_)
    const targetId = config.target_id as string | undefined;
    if (
      targetId &&
      (targetId.startsWith('va_') || targetId.startsWith('dp_') || targetId.startsWith('svm_'))
    ) {
      config.timeout = 0;
      config.next = undefined;
    }

    dialPlanNodes.push({
      id: node.id,
      type: reg.apiType ?? originalNode.type,
      position: node.position,
      config,
    });
  }

  return { entry_node: entryNode, nodes: dialPlanNodes };
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationError {
  nodeId: string;
  field: string;
  message: string;
}

/** Validate dial plan nodes before saving. Returns errors for nodes with missing or invalid config. */
export function validateDialPlanNodes(nodes: Node[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of nodes) {
    if (node.id === START_NODE_ID) continue;
    const original = (node.data as Record<string, unknown>)?.originalNode as
      | { type: string; config: Record<string, unknown> }
      | undefined;
    if (!original) continue;
    const config = original.config;

    switch (original.type) {
      case 'schedule':
        if (!config.schedule_id)
          errors.push({ nodeId: node.id, field: 'schedule_id', message: 'Schedule is required' });
        break;
      case 'internal_dial': {
        if (!config.target_id)
          errors.push({ nodeId: node.id, field: 'target_id', message: 'Target is required' });
        const dialTimeout = config.timeout as number | undefined;
        if (dialTimeout !== undefined && (dialTimeout < 0 || dialTimeout > 300))
          errors.push({
            nodeId: node.id,
            field: 'timeout',
            message: 'Timeout must be 0–300 seconds',
          });
        break;
      }
      case 'ring_all_users': {
        const timeout = config.timeout as number | undefined;
        if (timeout === undefined || timeout < 1 || timeout > 300)
          errors.push({
            nodeId: node.id,
            field: 'timeout',
            message: 'Timeout must be 1–300 seconds',
          });
        break;
      }
    }
  }

  return errors;
}

// ============================================================================
// Auto Layout
// ============================================================================

/** Y offset in pixels for nodes connected to each exit type */
const EXIT_OFFSETS: Record<string, number> = {
  open: -75, // Move up
  closed: 75, // Move down
  next: 50, // Move down slightly
};

/**
 * Apply dagre auto-layout to position nodes, with post-layout adjustments
 * to account for specific exit handle positions.
 */
export function applyAutoLayout(nodes: DialPlanGraphNode[], edges: Edge[]): TransformResult {
  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir: 'LR', // Left to right
    nodesep: 150, // Vertical separation between nodes (large to avoid edge/node overlaps)
    ranksep: 100, // Horizontal separation between ranks
    marginx: 40,
    marginy: 40,
  });

  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to dagre graph
  for (const node of nodes) {
    const height = node.type === 'schedule' ? SCHEDULE_NODE_HEIGHT : NODE_HEIGHT;
    g.setNode(node.id, { width: NODE_WIDTH, height });
  }

  // Add edges to dagre graph
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Run the layout algorithm
  dagre.layout(g);

  // Apply calculated positions to nodes
  let positionedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    const height = node.type === 'schedule' ? SCHEDULE_NODE_HEIGHT : NODE_HEIGHT;

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  // Post-layout adjustment: offset nodes based on their incoming edge source handles
  // This helps prevent edges from passing through other nodes
  positionedNodes = adjustNodePositionsForExits(positionedNodes, edges);

  return { nodes: positionedNodes, edges };
}

/**
 * Adjust node Y positions based on which source handles their incoming edges connect from.
 * Nodes connected to 'open' exits move up, nodes connected to 'closed' exits move down.
 */
function adjustNodePositionsForExits(
  nodes: DialPlanGraphNode[],
  edges: Edge[]
): DialPlanGraphNode[] {
  // Calculate Y offset for each node based on incoming edges
  const nodeOffsets = new Map<string, { total: number; count: number }>();

  for (const edge of edges) {
    const sourceHandle = edge.sourceHandle;
    if (!sourceHandle || EXIT_OFFSETS[sourceHandle] === undefined) continue;

    const offset = EXIT_OFFSETS[sourceHandle];

    // Accumulate offsets for averaging
    const current = nodeOffsets.get(edge.target) ?? { total: 0, count: 0 };
    nodeOffsets.set(edge.target, {
      total: current.total + offset,
      count: current.count + 1,
    });
  }

  // Apply averaged offsets to nodes
  return nodes.map((node) => {
    const offsetData = nodeOffsets.get(node.id);
    if (!offsetData) return node;

    const avgOffset = offsetData.total / offsetData.count;

    return {
      ...node,
      position: {
        x: node.position.x,
        y: node.position.y + avgOffset,
      },
    };
  });
}
