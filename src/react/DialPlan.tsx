/**
 * DialPlan Component
 *
 * A unified dial plan component that supports both view-only and edit modes.
 * - View mode (default): renders a read-only flow diagram with optional minimap
 * - Edit mode (editable=true): adds node library, config panel, toolbar, drag/drop
 *
 * Supports create mode (no dialPlanId + editable) and edit mode (with dialPlanId).
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
  type Edge,
  type NodeTypes,
  type Connection,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  getOutgoers,
} from '@xyflow/react';
import xyflowStyles from '@xyflow/react/dist/style.css';

import { useDialstackComponents } from './DialstackComponentsProvider';
import type { DialStackInstance } from '../types';
import {
  transformDialPlanToGraph,
  transformGraphToDialPlan,
  applyAutoLayout,
  type DialPlanGraphNode,
} from '../utils/dial-plan-graph';
import { defaultRegistry } from './dial-plan/default-registry';
import { StartNode } from './dial-plan/StartNode';
import { NodeLibrary } from './dial-plan/NodeLibrary';
import { NodeConfigPanel } from './dial-plan/NodeConfigPanel';
import { EditorToolbar } from './dial-plan/EditorToolbar';
import { injectDialPlanStyles, injectStyles } from './dial-plan/styles';
import type { ResourceType } from './dial-plan/registry-types';
import type {
  DialPlan as DialPlanData,
  DialPlanNode,
  DialPlanLocale,
  ScheduleNodeData,
  InternalDialNodeData,
} from '../types/dial-plan';
import type { ConfigPanelProps } from './dial-plan/registry-types';
import { formatValidationError } from '../utils/format-validation-error';

// ============================================================================
// Types
// ============================================================================

export interface DialPlanProps {
  /** The ID of the dial plan to fetch and display */
  dialPlanId?: string;
  /** Enable editing mode with node library, config panel, and toolbar */
  editable?: boolean;
  /** Whether to show the minimap for navigation (view mode only, default: false) */
  showMinimap?: boolean;
  /** Locale strings for node labels and exits */
  locale?: DialPlanLocale;
  /** Callback fired when a node is clicked (view mode) */
  onNodeClick?: (nodeId: string, node: DialPlanNode) => void;
  /** Callback fired when the dial plan starts loading */
  onLoaderStart?: () => void;
  /** Callback fired when the dial plan finishes loading */
  onLoaderEnd?: (dialPlan: DialPlanData) => void;
  /** Callback fired when there's an error */
  onLoadError?: (error: Error) => void;
  /** Callback fired when the dial plan is saved (edit mode) */
  onSave?: (dialPlan: DialPlanData) => void;
  /** Callback fired when dirty state changes (edit mode) */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Alias for onLoadError, used in edit mode */
  onError?: (error: Error) => void;
  /** Optional CSS class name for the container */
  className?: string;
  /** Optional inline styles for the container */
  style?: React.CSSProperties;
  /** Optional callback to create a new resource from a config panel select. Provided by the host app. */
  onCreateResource?: (type: ResourceType) => Promise<{ id: string; name: string } | undefined>;
}

// ============================================================================
// Constants
// ============================================================================

const defaultDialPlanLocale: DialPlanLocale = {
  nodeTypes: {
    start: 'Start',
    schedule: 'Schedule',
    internalDial: 'Dial',
    voicemail: 'Voicemail',
  },
  exits: {
    open: 'Open',
    closed: 'Closed',
    next: 'No Answer',
    timeout: 'Timeout',
  },
};

const defaultDialPlanData: DialPlanData = {
  id: '',
  name: 'New Dial Plan',
  entry_node: 'ring1',
  nodes: [{ id: 'ring1', type: 'ring_all_users', config: { timeout: 24 } }],
  created_at: '',
  updated_at: '',
};

// Node types for React Flow (from registry, shared by both modes)
const nodeTypes: NodeTypes = {
  start: StartNode,
  ...defaultRegistry.getNodeTypesMap(),
};

// Types for API responses (view mode resource resolution)
interface Schedule {
  id: string;
  name: string;
}

interface User {
  id: string;
  name?: string;
  email?: string;
}

interface ResourceMaps {
  schedules: Map<string, Schedule>;
  users: Map<string, User>;
}

// ============================================================================
// Helpers
// ============================================================================

/** Fetch schedules and dial targets referenced by dial plan nodes. */
async function fetchResourceMaps(
  data: DialPlanData,
  dialstack: DialStackInstance
): Promise<ResourceMaps> {
  const scheduleIds = new Set<string>();
  const targetIds = new Set<string>();
  for (const node of data.nodes) {
    if (node.type === 'schedule') scheduleIds.add(node.config.schedule_id);
    else if (node.type === 'internal_dial') targetIds.add(node.config.target_id);
  }

  const [schedules, ...targetResults] = await Promise.all([
    Promise.all(
      Array.from(scheduleIds).map(async (id) => {
        try {
          return await dialstack.getSchedule(id);
        } catch {
          return null;
        }
      })
    ),
    ...Array.from(targetIds).map(async (id) => {
      const resolved = await dialstack.resolveRoutingTarget(id);
      if (!resolved) return null;
      return { id: resolved.id, name: resolved.name || resolved.id } as User;
    }),
  ]);

  const scheduleMap = new Map<string, Schedule>();
  const userMap = new Map<string, User>();
  for (const s of schedules) if (s) scheduleMap.set(s.id, s);
  for (const t of targetResults) if (t) userMap.set(t.id, t);

  return { schedules: scheduleMap, users: userMap };
}

function resolveTargetType(targetId: string): string {
  if (targetId.startsWith('user_')) return 'User';
  if (targetId.startsWith('rg_')) return 'Ring Group';
  if (targetId.startsWith('dp_')) return 'Dial Plan';
  if (targetId.startsWith('va_')) return 'Voice App';
  if (targetId.startsWith('svm_')) return 'Shared Voicemail';
  return 'Dial';
}

/** Enrich graph nodes with resolved resource names and locale strings. */
function enrichNodesWithResources(
  graphNodes: DialPlanGraphNode[],
  maps: ResourceMaps,
  locale: DialPlanLocale
): DialPlanGraphNode[] {
  return graphNodes.map((node) => {
    if (node.type === 'start') {
      return { ...node, data: { ...node.data, locale } };
    } else if (node.type === 'schedule') {
      const data = node.data as ScheduleNodeData;
      const schedule = maps.schedules.get(data.scheduleId);
      return { ...node, data: { ...data, scheduleName: schedule?.name, locale } };
    } else if (node.type === 'internalDial' || node.type === 'voicemail') {
      const data = node.data as InternalDialNodeData;
      const user = maps.users.get(data.targetId);
      const targetName = user?.name || user?.email;
      const targetType = resolveTargetType(data.targetId);
      return { ...node, data: { ...data, targetName, targetType, locale } };
    }
    return node;
  });
}

// ============================================================================
// Inner component (needs ReactFlowProvider context for edit mode)
// ============================================================================

function DialPlanInner({
  dialPlanId,
  editable = false,
  showMinimap = false,
  locale = defaultDialPlanLocale,
  onNodeClick,
  onLoaderStart,
  onLoaderEnd,
  onLoadError,
  onSave,
  onDirtyChange,
  onError,
  className,
  style,
  onCreateResource,
}: DialPlanProps) {
  const { dialstack } = useDialstackComponents();
  const reactFlowInstance = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  // Shared state
  const [isLoading, setIsLoading] = useState(editable ? !!dialPlanId : true);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // Edit-mode state
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => {
    callbacksRef.current.onDirtyChange?.(isDirty);
  }, [isDirty]);
  const [dialPlanMeta, setDialPlanMeta] = useState<{ id: string; name: string } | null>(null);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);

  // Refs for current state (avoid stale closures in callbacks)
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Refs to avoid stale closures in async load effect
  const callbacksRef = useRef({
    onLoaderStart,
    onLoaderEnd,
    onLoadError,
    onError,
    onSave,
    onDirtyChange,
  });
  callbacksRef.current = {
    onLoaderStart,
    onLoaderEnd,
    onLoadError,
    onError,
    onSave,
    onDirtyChange,
  };
  const initialGraphRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  // Inject styles on mount
  useEffect(() => {
    injectStyles('xyflow', xyflowStyles);
    injectDialPlanStyles();
  }, []);

  // ---- Fetch dial plan + resolve resources (shared by view and edit modes) ----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Edit mode without dialPlanId: create mode with default template
      if (editable && !dialPlanId) {
        const { nodes: initNodes, edges: initEdges } = transformDialPlanToGraph(
          defaultDialPlanData,
          defaultRegistry
        );
        if (!cancelled) {
          setNodes(initNodes as Node[]);
          setEdges(initEdges);
          initialGraphRef.current = { nodes: initNodes as Node[], edges: initEdges };
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      callbacksRef.current.onLoaderStart?.();

      try {
        const data = await dialstack.getDialPlan(dialPlanId!);
        if (cancelled) return;

        // Resolve referenced resources (schedules, users, extensions)
        const maps = await fetchResourceMaps(data, dialstack);
        if (cancelled) return;

        // Transform to graph nodes and enrich with resolved names
        const { nodes: graphNodes, edges: graphEdges } = transformDialPlanToGraph(
          data,
          defaultRegistry
        );
        const enrichedNodes = enrichNodesWithResources(graphNodes, maps, locale);

        setNodes(enrichedNodes as Node[]);
        setEdges(graphEdges);
        initialGraphRef.current = { nodes: enrichedNodes as Node[], edges: graphEdges };
        setDialPlanMeta({ id: data.id, name: data.name });

        setIsLoading(false);
        callbacksRef.current.onLoaderEnd?.(data);
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(String(err));
          setLoadError(error);
          setIsLoading(false);
          callbacksRef.current.onLoadError?.(error);
          callbacksRef.current.onError?.(error);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale is stable; editable only changes UI, not data
  }, [dialstack, dialPlanId, setNodes, setEdges]);

  // ---- Edit mode: dirty tracking ----
  const updateDirty = useCallback((nextNodes: Node[], nextEdges: Edge[]) => {
    if (!initialGraphRef.current) return;
    const serialize = (ns: Node[], es: Edge[]) =>
      JSON.stringify({
        nodes: ns.map((n) => ({ id: n.id, data: n.data, position: n.position })),
        edges: es.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
        })),
      });
    const nextDirty =
      serialize(initialGraphRef.current.nodes, initialGraphRef.current.edges) !==
      serialize(nextNodes, nextEdges);
    setIsDirty(nextDirty);
  }, []);

  // Wrap onEdgesChange to track dirty state on edge removals
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChangeBase(changes);
      if (changes.some((c) => c.type === 'remove')) {
        // Edges are updated asynchronously by onEdgesChangeBase; use a microtask to read the ref
        queueMicrotask(() => updateDirty(nodesRef.current, edgesRef.current));
      }
    },
    [onEdgesChangeBase, updateDirty]
  );

  // ---- Edit mode: handle node changes (drag, select, etc.) ----
  // Filter out remove changes — nodes are deleted via the config panel, not keyboard
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const filtered = changes.filter((c) => c.type !== 'remove');
      if (filtered.length === 0) return;
      const updated = applyNodeChanges(filtered, nodesRef.current);
      setNodes(updated);
      // Check dirty when positions change (drag end)
      if (filtered.some((c) => c.type === 'position' && !c.dragging)) {
        updateDirty(updated, edgesRef.current);
      }
    },
    [setNodes, updateDirty]
  );

  // ---- Edit mode: add node ----
  const handleAddNode = useCallback(
    (type: string, position?: { x: number; y: number }) => {
      const reg = defaultRegistry.get(type);
      if (!reg) return;

      const id = `${type}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      let pos = position;
      if (!pos) {
        // Place at the center of the visible canvas viewport
        const rect = canvasRef.current?.getBoundingClientRect();
        const centerX = rect ? rect.left + rect.width / 2 : 400;
        const centerY = rect ? rect.top + rect.height / 2 : 300;
        pos = reactFlowInstance.screenToFlowPosition({ x: centerX, y: centerY });
      }
      const originalNode = { id, type: reg.apiType ?? type, config: { ...reg.defaultConfig } };
      const data = reg.toFlowNode(originalNode as unknown as DialPlanNode);
      const newNode: Node = { id, type: reg.flowType, position: pos, data };

      setNodes((prev) => {
        const next = [...prev, newNode];
        updateDirty(next, edgesRef.current);
        return next;
      });
      setSelectedNodeId(id);
    },
    [reactFlowInstance, setNodes, updateDirty]
  );

  // ---- Edit mode: drag/drop ----
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      handleAddNode(type, position);
    },
    [reactFlowInstance, handleAddNode]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // ---- Edit mode: delete node ----
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const next = nodesRef.current
        .filter((n) => n.id !== nodeId)
        .map((n) => {
          const originalNode = n.data?.originalNode as Record<string, unknown> | undefined;
          if (!originalNode) return n;
          const config = originalNode.config as Record<string, unknown> | undefined;
          if (!config) return n;
          const updatedConfig = { ...config };
          let changed = false;
          for (const key of Object.keys(updatedConfig)) {
            if (updatedConfig[key] === nodeId) {
              updatedConfig[key] = undefined;
              changed = true;
            }
          }
          if (!changed) return n;
          return {
            ...n,
            data: { ...n.data, originalNode: { ...originalNode, config: updatedConfig } },
          };
        });
      const nextEdges = edgesRef.current.filter((e) => e.source !== nodeId && e.target !== nodeId);
      setNodes(next);
      setEdges(nextEdges);
      updateDirty(next, nextEdges);
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    },
    [setNodes, setEdges, selectedNodeId, updateDirty]
  );

  // ---- Edit mode: connect edges ----
  const handleConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        id: `${connection.source}-${connection.sourceHandle ?? ''}->${connection.target}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#94a3b8' },
      };
      setEdges((prev) => {
        const filtered = prev.filter(
          (e) =>
            !(
              e.source === connection.source &&
              (e.sourceHandle ?? null) === (connection.sourceHandle ?? null)
            )
        );
        const next = [...filtered, newEdge];
        updateDirty(nodesRef.current, next);
        return next;
      });
    },
    [setEdges, updateDirty]
  );

  // ---- Edit mode: cycle prevention ----
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      // Prevent self-connections
      if (connection.source === connection.target) return false;

      // Prevent cycles: walk outgoers from target to see if we reach source
      const target = nodes.find((n) => n.id === connection.target);
      if (!target) return false;

      const visited = new Set<string>();
      const stack = [target];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (current.id === connection.source) return false;
        if (visited.has(current.id)) continue;
        visited.add(current.id);
        const outgoers = getOutgoers(current, nodes, edges);
        stack.push(...outgoers);
      }
      return true;
    },
    [nodes, edges]
  );

  // ---- Edit mode: config panel ----
  const handleConfigChange = useCallback(
    (
      nodeId: string,
      configUpdates: Record<string, unknown>,
      displayUpdates?: Record<string, unknown>
    ) => {
      setNodes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== nodeId) return n;
          const originalNode = n.data?.originalNode as Record<string, unknown> | undefined;
          if (!originalNode) return n;
          const updatedOriginal = {
            ...originalNode,
            config: { ...(originalNode.config as Record<string, unknown>), ...configUpdates },
          };
          const reg = defaultRegistry.getByFlowType(n.type ?? '');
          const freshData = reg
            ? reg.toFlowNode(updatedOriginal as unknown as DialPlanNode)
            : { ...n.data, originalNode: updatedOriginal };
          // Derive targetType from target_id if it changed
          const targetId = configUpdates.target_id as string | undefined;
          const targetType = targetId ? resolveTargetType(targetId) : undefined;
          // Merge: previous display fields → fresh structural fields → explicit display overrides → derived type
          return {
            ...n,
            data: { ...n.data, ...freshData, ...displayUpdates, ...(targetType && { targetType }) },
          };
        });
        updateDirty(next, edgesRef.current);
        return next;
      });
      // Re-scan handles when target changes (terminal ↔ non-terminal toggles exit handles)
      if (configUpdates.target_id) {
        queueMicrotask(() => updateNodeInternals(nodeId));
      }
    },
    [setNodes, updateDirty, updateNodeInternals]
  );

  // ---- Edit mode: auto layout ----
  const handleAutoLayout = useCallback(() => {
    const { nodes: laid, edges: laidEdges } = applyAutoLayout(nodes as DialPlanGraphNode[], edges);
    setNodes(laid as Node[]);
    setEdges(laidEdges);
    updateDirty(laid as Node[], laidEdges);
    requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.2 }));
  }, [nodes, edges, setNodes, setEdges, updateDirty, reactFlowInstance]);

  // ---- Edit mode: resource listing for config panels ----
  const listResources: ConfigPanelProps['listResources'] = useCallback(
    async (type) => {
      try {
        let items: Array<{ id: string; name: string }>;
        switch (type) {
          case 'schedule':
            items = await dialstack.listSchedules();
            break;
          case 'user':
            items = (await dialstack.listUsers()).map((u) => ({
              id: u.id,
              name: u.name || u.email || u.id,
            }));
            break;
          case 'ring_group':
            items = await dialstack.listRingGroups();
            break;
          case 'dial_plan': {
            const all = await dialstack.listDialPlans();
            const currentId = dialPlanMeta?.id ?? dialPlanId;
            items = all.filter((p) => p.id !== currentId);
            break;
          }
          case 'voice_app':
            items = await dialstack.listVoiceApps();
            break;
          case 'shared_voicemail':
            items = await dialstack.listSharedVoicemailBoxes();
            break;
          default:
            return [];
        }
        return items;
      } catch {
        return [];
      }
    },
    [dialstack, dialPlanId, dialPlanMeta]
  );

  // ---- Edit mode: save ----
  const handleSave = useCallback(async () => {
    try {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const payload = transformGraphToDialPlan(currentNodes, currentEdges, defaultRegistry);
      const saved = dialPlanId
        ? await dialstack.updateDialPlan(dialPlanId, payload)
        : await dialstack.createDialPlan(payload);
      initialGraphRef.current = { nodes: [...currentNodes], edges: [...currentEdges] };
      setIsDirty(false);
      callbacksRef.current.onDirtyChange?.(false);
      callbacksRef.current.onSave?.(saved as DialPlanData);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // Parse API error path (e.g. "/nodes/3/config/schedule_id: ...") to select the node
      const nodeMatch = error.message.match(/^\/nodes\/(\d+)\//);
      if (nodeMatch?.[1]) {
        const payload = transformGraphToDialPlan(
          nodesRef.current,
          edgesRef.current,
          defaultRegistry
        );
        const nodeIndex = parseInt(nodeMatch[1], 10);
        const node = payload.nodes[nodeIndex];
        if (node) setSelectedNodeId(node.id);
      }
      callbacksRef.current.onError?.(
        error.message.includes('/nodes/')
          ? new Error(
              formatValidationError(
                error.message,
                transformGraphToDialPlan(nodesRef.current, edgesRef.current, defaultRegistry).nodes
              )
            )
          : error
      );
    }
  }, [dialstack, dialPlanId]);

  // ---- Edit mode: node click opens config ----
  const handleEditNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.id === '__start__') return;
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  // ---- Edit mode: edge click opens edge panel ----
  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      const nextEdges = edgesRef.current.filter((e) => e.id !== edgeId);
      setEdges(nextEdges);
      updateDirty(nodesRef.current, nextEdges);
      setSelectedEdgeId(null);
    },
    [setEdges, updateDirty]
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  // ---- View mode: node click callback ----
  const handleViewNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!onNodeClick) return;
      if (node.id === '__start__') return;
      const originalNode = (node.data as Record<string, unknown>)?.originalNode as
        | DialPlanNode
        | undefined;
      if (originalNode) onNodeClick(node.id, originalNode);
    },
    [onNodeClick]
  );

  // Minimap node color
  const minimapNodeColor = useCallback((node: Node) => {
    switch (node.type) {
      case 'start':
        return '#3b82f6';
      case 'schedule':
        return '#0ea5e9';
      case 'internalDial':
        return '#22c55e';
      default:
        return '#94a3b8';
    }
  }, []);

  // Selected node/edge for config panel (edit mode)
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const selectedReg = selectedNode ? defaultRegistry.getByFlowType(selectedNode.type ?? '') : null;
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null;
  const panelOpen = !!(selectedNode && selectedReg) || !!selectedEdge;

  // ---- Shared loading/error states ----
  if (isLoading) {
    return (
      <div
        className={`ds-dial-plan-viewer ds-dial-plan-viewer--loading ${className || ''}`}
        style={style}
      >
        <div className="ds-dial-plan-viewer__loading">
          <div className="ds-dial-plan-viewer__spinner" />
          <span>Loading dial plan...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className={`ds-dial-plan-viewer ds-dial-plan-viewer--error ${className || ''}`}
        style={style}
      >
        <div className="ds-dial-plan-viewer__error">
          <span>Failed to load dial plan</span>
          <span className="ds-dial-plan-viewer__error-message">{loadError.message}</span>
        </div>
      </div>
    );
  }

  // No data (view mode with no nodes loaded)
  if (!editable && nodes.length === 0) {
    return (
      <div
        className={`ds-dial-plan-viewer ds-dial-plan-viewer--empty ${className || ''}`}
        style={style}
      >
        <div className="ds-dial-plan-viewer__empty">
          <span>No dial plan found</span>
        </div>
      </div>
    );
  }

  const canvas = (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={editable ? handleNodesChange : undefined}
      onEdgesChange={editable ? onEdgesChange : undefined}
      onConnect={editable ? handleConnect : undefined}
      onEdgeClick={editable ? handleEdgeClick : undefined}
      isValidConnection={editable ? isValidConnection : undefined}
      onNodeClick={editable ? handleEditNodeClick : onNodeClick ? handleViewNodeClick : undefined}
      onPaneClick={editable ? handlePaneClick : undefined}
      nodesDraggable={editable}
      nodesConnectable={editable}
      elementsSelectable={editable}
      selectionOnDrag={false}
      selectNodesOnDrag={false}
      panOnDrag
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
      fitView
      fitViewOptions={{ padding: 0.3, minZoom: 0.5, maxZoom: 1.5 }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{
        type: 'smoothstep',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#94a3b8' },
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} />
      {editable && (
        <EditorToolbar onAutoLayout={handleAutoLayout} onSave={handleSave} isDirty={isDirty} />
      )}
      {showMinimap && (
        <MiniMap nodeColor={minimapNodeColor} maskColor="rgba(0, 0, 0, 0.1)" pannable zoomable />
      )}
    </ReactFlow>
  );

  return (
    <div className={`ds-dial-plan-editor ${className || ''}`} style={style}>
      {editable && (
        <div
          className={`ds-dial-plan-node-library-wrapper${libraryCollapsed ? ' ds-dial-plan-node-library-wrapper--collapsed' : ''}`}
        >
          <NodeLibrary
            registry={defaultRegistry}
            onAddNode={handleAddNode}
            onCollapse={() => setLibraryCollapsed(true)}
          />
        </div>
      )}
      {editable && libraryCollapsed && (
        <button
          type="button"
          className="ds-dial-plan-library-toggle"
          onClick={() => setLibraryCollapsed(false)}
          title="Show node library"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
      <div
        ref={canvasRef}
        className="ds-dial-plan-editor__canvas"
        onDrop={editable ? handleDrop : undefined}
        onDragOver={editable ? handleDragOver : undefined}
      >
        {canvas}
      </div>
      {editable && (
        <div
          className={`ds-dial-plan-config-panel-wrapper${panelOpen ? ' ds-dial-plan-config-panel-wrapper--open' : ''}`}
        >
          {selectedNode && selectedReg && (
            <NodeConfigPanel
              node={selectedNode as { id: string; type: string; data: Record<string, unknown> }}
              registration={selectedReg}
              onConfigChange={handleConfigChange}
              onDelete={handleDeleteNode}
              onClose={() => setSelectedNodeId(null)}
              listResources={listResources}
              onCreateResource={onCreateResource}
            />
          )}
          {selectedEdge && (
            <div className="ds-dial-plan-config-panel">
              <div className="ds-dial-plan-config-panel__header">
                <span className="ds-dial-plan-config-panel__header-icon">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </span>
                <span className="ds-dial-plan-config-panel__header-label">Connection</span>
                <button
                  type="button"
                  className="ds-dial-plan-config-panel__delete"
                  onClick={() => handleDeleteEdge(selectedEdge.id)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="ds-dial-plan-config-panel__close"
                  onClick={() => setSelectedEdgeId(null)}
                  title="Close"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="ds-dial-plan-config-panel__body">
                <div className="ds-dial-plan-config-field">
                  <span className="ds-dial-plan-config-field__label">From</span>
                  <span className="ds-dial-plan-edge-panel__value">
                    {(() => {
                      const n = nodes.find((n) => n.id === selectedEdge.source);
                      const reg = n ? defaultRegistry.getByFlowType(n.type ?? '') : null;
                      const name = reg?.label ?? n?.type ?? selectedEdge.source;
                      return name.charAt(0).toUpperCase() + name.slice(1);
                    })()}
                  </span>
                </div>
                {selectedEdge.sourceHandle && (
                  <div className="ds-dial-plan-config-field">
                    <span className="ds-dial-plan-config-field__label">Exit</span>
                    <span className="ds-dial-plan-edge-panel__value">
                      {selectedEdge.sourceHandle.charAt(0).toUpperCase() +
                        selectedEdge.sourceHandle.slice(1)}
                    </span>
                  </div>
                )}
                <div className="ds-dial-plan-config-field">
                  <span className="ds-dial-plan-config-field__label">To</span>
                  <span className="ds-dial-plan-edge-panel__value">
                    {(() => {
                      const n = nodes.find((n) => n.id === selectedEdge.target);
                      const reg = n ? defaultRegistry.getByFlowType(n.type ?? '') : null;
                      const name = reg?.label ?? n?.type ?? selectedEdge.target;
                      return name.charAt(0).toUpperCase() + name.slice(1);
                    })()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Public component
// ============================================================================

/**
 * DialPlan renders a dial plan as an interactive flow diagram.
 *
 * Use `editable` prop to switch between view-only and edit modes.
 *
 * @example
 * ```tsx
 * // View mode
 * <DialPlan dialPlanId="dp_01abc" />
 *
 * // Edit mode
 * <DialPlan dialPlanId="dp_01abc" editable onSave={(plan) => console.log(plan)} />
 *
 * // Create mode
 * <DialPlan editable onSave={(plan) => console.log(plan)} />
 * ```
 */
export const DialPlan: React.FC<DialPlanProps> = (props) => {
  return (
    <ReactFlowProvider>
      <DialPlanInner {...props} />
    </ReactFlowProvider>
  );
};
