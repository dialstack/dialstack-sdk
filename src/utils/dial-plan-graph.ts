/**
 * Dial Plan Graph Utilities
 *
 * Functions to transform dial plan data structures into React Flow nodes and edges.
 */

import type { Node, Edge } from '@xyflow/react';
import dagre from 'dagre';
import type {
  DialPlan,
  DialPlanNode,
  StartNodeData,
  ScheduleNodeData,
  InternalDialNodeData,
  ScheduleNode,
  InternalDialNode,
} from '../types/dial-plan';

// ============================================================================
// Constants
// ============================================================================

const START_NODE_ID = '__start__';
const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
const SCHEDULE_NODE_HEIGHT = 140;

// ============================================================================
// Types
// ============================================================================

/** A React Flow node with our custom data types */
export type DialPlanGraphNode = Node<StartNodeData | ScheduleNodeData | InternalDialNodeData>;

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
    case 'holiday':
      return 'Holiday';
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
export function transformDialPlanToGraph(dialPlan: DialPlan): TransformResult {
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
      type: 'smoothstep',
    });
  }

  // Process each node in the dial plan
  for (const node of dialPlan.nodes) {
    const flowNode = createFlowNode(node);
    nodes.push(flowNode);

    // Create edges based on node type
    const nodeEdges = createEdgesForNode(node, nodeMap);
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
 * Create a React Flow node from a dial plan node.
 */
function createFlowNode(node: DialPlanNode): DialPlanGraphNode {
  const position = node.position ?? { x: 0, y: 0 };

  switch (node.type) {
    case 'schedule':
      return {
        id: node.id,
        type: 'schedule',
        position,
        data: {
          label: getNodeLabel(node),
          scheduleId: node.config.schedule_id,
          originalNode: node,
        } as ScheduleNodeData,
      };

    case 'internal_dial':
      return {
        id: node.id,
        type: 'internalDial',
        position,
        data: {
          label: getNodeLabel(node),
          targetId: node.config.target_id,
          timeout: node.config.timeout,
          originalNode: node,
        } as InternalDialNodeData,
      };

    default:
      // Fallback for unknown types
      return {
        id: (node as DialPlanNode).id,
        type: 'default',
        position,
        data: {
          label: (node as DialPlanNode).id,
          targetId: '',
          originalNode: node as InternalDialNode,
        } as InternalDialNodeData,
      };
  }
}

/**
 * Create edges for a dial plan node based on its exits.
 */
function createEdgesForNode(node: DialPlanNode, nodeMap: Map<string, DialPlanNode>): Edge[] {
  const edges: Edge[] = [];

  switch (node.type) {
    case 'schedule': {
      const config = (node as ScheduleNode).config;
      const exits: Array<{ key: 'open' | 'closed' | 'holiday'; target?: string }> = [
        { key: 'open', target: config.open },
        { key: 'closed', target: config.closed },
        { key: 'holiday', target: config.holiday },
      ];

      for (const exit of exits) {
        if (exit.target && nodeMap.has(exit.target)) {
          edges.push({
            id: `${node.id}-${exit.key}->${exit.target}`,
            source: node.id,
            target: exit.target,
            sourceHandle: exit.key,
            type: 'smoothstep',
          });
        }
      }
      break;
    }

    case 'internal_dial': {
      const config = (node as InternalDialNode).config;
      if (config.next && nodeMap.has(config.next)) {
        edges.push({
          id: `${node.id}-next->${config.next}`,
          source: node.id,
          target: config.next,
          sourceHandle: 'next',
          type: 'smoothstep',
        });
      }
      break;
    }
  }

  return edges;
}

// ============================================================================
// Auto Layout
// ============================================================================

/** Y offset in pixels for nodes connected to each exit type */
const EXIT_OFFSETS: Record<string, number> = {
  open: -100, // Move up significantly
  closed: 50, // Move down slightly
  holiday: 100, // Move down significantly
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
 * Nodes connected to 'open' exits move up, nodes connected to 'holiday' exits move down.
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
