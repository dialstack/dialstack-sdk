/**
 * DialPlan Component
 *
 * A unified dial plan component with three display modes:
 * - 'view' (default): read-only flow diagram with pan/zoom and controls
 * - 'edit': full editor with node library, config panel, toolbar, drag/drop
 * - 'preview': static thumbnail — no controls, no background, no interaction
 *
 * Supports create mode (no dialPlanId + mode='edit').
 */

import React, { useCallback, useEffect, useState, useRef, useImperativeHandle } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ConnectionLineType,
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
} from '@xyflow/react';
import xyflowStyles from '@xyflow/react/dist/style.css';

import { useDialstackComponents } from './DialstackComponentsProvider';
import { useAppearance } from './useAppearance';
import type { DialStackInstance } from '../types';
import {
  transformDialPlanToGraph,
  transformGraphToDialPlan,
  applyAutoLayout,
  type DialPlanGraphNode,
} from '../utils/dial-plan-graph';
import { defaultRegistry, nodeDefinitions } from './dial-plan/default-registry';
import { resolveTargetType } from './dial-plan/nodes/resolve-target';
import { DIAL_PLAN_EDGE_TYPE } from './dial-plan/registry';
import { SmartEdge } from './dial-plan/SmartEdge';
import { StartNode } from './dial-plan/StartNode';
import { NodeLibrary } from './dial-plan/NodeLibrary';
import { NodeConfigPanel, trashIcon } from './dial-plan/NodeConfigPanel';
import { EditorToolbar } from './dial-plan/EditorToolbar';
import { dialPlanStyles } from './dial-plan/styles';
import { ShadowContainer } from './onboarding/ShadowRoot';
import type { ResourceType } from './dial-plan/registry-types';
import type {
  DialPlan as DialPlanData,
  DialPlanNode,
  DialPlanLocale,
  DialPlanMode,
  DialPlanHandle,
} from '../types/dial-plan';
import { defaultDialPlanLocale } from '../locales/en';
import type { ConfigPanelProps, ResourceMaps } from './dial-plan/registry-types';
import { formatValidationError } from '../utils/format-validation-error';

// ============================================================================
// Types
// ============================================================================

export interface DialPlanProps {
  /** The ID of the dial plan to fetch and display */
  dialPlanId?: string;
  /** Display mode: 'view' (default), 'edit', or 'preview' (static thumbnail) */
  mode?: DialPlanMode;
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
  /** Color theme: 'light' (default) or 'dark' */
  theme?: 'light' | 'dark';
  /** Optional CSS class name for the container */
  className?: string;
  /** Optional inline styles for the container */
  style?: React.CSSProperties;
  /** Optional callback to create a new resource from a config panel select. Provided by the host app. */
  onCreateResource?: (
    type: ResourceType
  ) => Promise<{ id: string; name: string; extension_number?: string } | undefined>;
  /** Optional callback to open a resource in a new tab. Provided by the host app. */
  onOpenResource?: (resourceId: string) => void;
}

/** Derived config from mode — single source of truth for all mode-dependent behavior */
interface ModeConfig {
  /** Can the user modify nodes/edges/config? */
  editable: boolean;
  /** Is pan/zoom/scroll enabled? */
  interactive: boolean;
  /** Show background dots and zoom controls? */
  showChrome: boolean;
}

const MODE_CONFIGS: Record<DialPlanMode, ModeConfig> = {
  view: { editable: false, interactive: true, showChrome: true },
  edit: { editable: true, interactive: true, showChrome: true },
  preview: { editable: false, interactive: false, showChrome: false },
};

// ============================================================================
// Constants
// ============================================================================

const defaultDialPlanData: DialPlanData = {
  id: '',
  name: 'New Dial Plan',
  entry_node: '',
  nodes: [],
  created_at: '',
  updated_at: '',
};

// Node types for React Flow (from registry, shared by both modes)
const nodeTypes: NodeTypes = {
  start: StartNode,
  ...defaultRegistry.getNodeTypesMap(),
};

const edgeTypes = {
  [DIAL_PLAN_EDGE_TYPE]: SmartEdge,
};

// ============================================================================
// Resource resolution helpers
// ============================================================================

async function fetchResourceMaps(
  data: DialPlanData,
  dialstack: DialStackInstance
): Promise<ResourceMaps> {
  const scheduleIds = new Set<string>();
  const targetIds = new Set<string>();
  const clipIds = new Set<string>();

  // Let each node type declare what resources it needs
  for (const node of data.nodes) {
    const reg = defaultRegistry.resolveType(node);
    const def = reg ? nodeDefinitions.find((d) => d.type === (reg.apiType ?? reg.type)) : null;
    def?.collectResourceIds?.(node.config as unknown as Record<string, unknown>, {
      addSchedule: (id) => scheduleIds.add(id),
      addTarget: (id) => targetIds.add(id),
      addAudioClip: (id) => clipIds.add(id),
    });
  }

  const clipListPromise =
    clipIds.size > 0
      ? dialstack.audioClips.list().catch(() => [] as Array<{ id: string; name: string }>)
      : Promise.resolve([] as Array<{ id: string; name: string }>);

  const [schedules, clipList, ...targetResults] = await Promise.all([
    Promise.all(
      Array.from(scheduleIds).map(async (id) => {
        try {
          return await dialstack.schedules.retrieve(id);
        } catch {
          return null;
        }
      })
    ),
    clipListPromise,
    ...Array.from(targetIds).map(async (id) => {
      const resolved = await dialstack.resolveRoutingTarget(id);
      if (!resolved) return null;
      return {
        id: resolved.id,
        name: resolved.name || resolved.id,
        extension_number: resolved.extension_number ?? undefined,
      };
    }),
  ]);

  const scheduleMap = new Map<string, { id: string; name: string }>();
  const userMap = new Map<
    string,
    { id: string; name?: string; email?: string; extension_number?: string }
  >();
  const clipMap = new Map<string, { id: string; name: string }>();
  for (const s of schedules) if (s) scheduleMap.set(s.id, s);
  for (const t of targetResults) if (t) userMap.set(t.id, t);
  for (const c of clipList) clipMap.set(c.id, c);

  return { schedules: scheduleMap, users: userMap, audioClips: clipMap };
}

function enrichNodesWithResources(
  graphNodes: DialPlanGraphNode[],
  maps: ResourceMaps,
  locale: DialPlanLocale
): DialPlanGraphNode[] {
  return graphNodes.map((node) => {
    const reg = defaultRegistry.getByFlowType(node.type ?? '');
    const def = reg ? nodeDefinitions.find((d) => d.type === (reg.apiType ?? reg.type)) : null;
    if (def?.enrichNode) {
      return { ...node, data: def.enrichNode(node.data, maps, locale) };
    }
    return { ...node, data: { ...node.data, locale } };
  });
}

// ============================================================================
// Inner component (needs ReactFlowProvider context for edit mode)
// ============================================================================

const DialPlanInner = React.forwardRef<DialPlanHandle, DialPlanProps>(function DialPlanInner(
  {
    dialPlanId,
    mode = 'view',
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
    onOpenResource,
  },
  ref
) {
  const { editable, interactive, showChrome } = MODE_CONFIGS[mode];
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
  // ---- Fetch dial plan + resolve resources (shared by view and edit modes) ----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Edit mode without dialPlanId: create mode with default template
      if (editable && !dialPlanId) {
        const { nodes: initNodes, edges: initEdges } = transformDialPlanToGraph(
          { ...defaultDialPlanData, name: locale.status.newDialPlan },
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
        const data = await dialstack.dialPlans.retrieve(dialPlanId!);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale is stable; mode only changes UI, not data
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

  // ---- Edit mode: delete node (shared by config panel and keyboard) ----
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

  // ---- Edit mode: handle node changes (drag, select, delete, etc.) ----
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Handle delete-key removals for non-start nodes (batch-safe)
      const removalIds = new Set(
        changes
          .filter((c) => c.type === 'remove' && 'id' in c && c.id !== '__start__')
          .map((c) => ('id' in c ? (c as { id: string }).id : ''))
      );
      if (removalIds.size > 0) {
        const next = nodesRef.current
          .filter((n) => !removalIds.has(n.id))
          .map((n) => {
            const originalNode = n.data?.originalNode as Record<string, unknown> | undefined;
            if (!originalNode) return n;
            const config = originalNode.config as Record<string, unknown> | undefined;
            if (!config) return n;
            const updatedConfig = { ...config };
            let changed = false;
            for (const key of Object.keys(updatedConfig)) {
              if (
                typeof updatedConfig[key] === 'string' &&
                removalIds.has(updatedConfig[key] as string)
              ) {
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
        const nextEdges = edgesRef.current.filter(
          (e) => !removalIds.has(e.source) && !removalIds.has(e.target)
        );
        setNodes(next);
        setEdges(nextEdges);
        updateDirty(next, nextEdges);
        if (selectedNodeId && removalIds.has(selectedNodeId)) setSelectedNodeId(null);
      }

      const filtered = changes.filter(
        (c) => c.type !== 'remove' && !(c.type === 'position' && 'id' in c && c.id === '__start__')
      );
      if (filtered.length === 0) return;
      const updated = applyNodeChanges(filtered, nodesRef.current);
      setNodes(updated);
      // Check dirty when positions change (drag end)
      if (filtered.some((c) => c.type === 'position' && !c.dragging)) {
        updateDirty(updated, edgesRef.current);
      }
    },
    [setNodes, setEdges, updateDirty, selectedNodeId]
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
      const newNode: Node = { id, type: reg.flowType, position: pos, data, selected: true };

      setNodes((prev) => {
        const next = prev.map((n) => (n.selected ? { ...n, selected: false } : n));
        next.push(newNode);
        updateDirty(next, edgesRef.current);
        return next;
      });
      setSelectedNodeId(id);

      // After the config panel opens, center the viewport on the new node
      requestAnimationFrame(() => {
        reactFlowInstance.setCenter(pos.x, pos.y, {
          zoom: reactFlowInstance.getZoom(),
          duration: 200,
        });
      });
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

  // ---- Edit mode: connect edges ----
  const handleConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        id: `${connection.source}-${connection.sourceHandle ?? ''}->${connection.target}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        type: DIAL_PLAN_EDGE_TYPE,
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#94a3b8' },
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

  // ---- Edit mode: reconnect (drag existing edge endpoint to a different node) ----
  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((prev) => {
        const filtered = prev.filter(
          (e) =>
            e.id !== oldEdge.id &&
            !(
              e.source === newConnection.source &&
              (e.sourceHandle ?? null) === (newConnection.sourceHandle ?? null)
            )
        );
        const reconnected: Edge = {
          id: `${newConnection.source}-${newConnection.sourceHandle ?? ''}->${newConnection.target}`,
          source: newConnection.source,
          target: newConnection.target,
          sourceHandle: newConnection.sourceHandle ?? undefined,
          targetHandle: newConnection.targetHandle ?? undefined,
          type: DIAL_PLAN_EDGE_TYPE,
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#94a3b8' },
        };
        const next = [...filtered, reconnected];
        updateDirty(nodesRef.current, next);
        return next;
      });
    },
    [setEdges, updateDirty]
  );

  // ---- Edit mode: connection validation ----
  // Cycles through multiple nodes are allowed. Direct self-loops require
  // the source node's registration to opt in via `allowSelfLoop`.
  const isValidConnection = useCallback(
    (conn: { source: string | null; target: string | null }) => {
      if (!conn.source || !conn.target || conn.source !== conn.target) return true;
      const node = nodesRef.current.find((n) => n.id === conn.source);
      const reg = defaultRegistry.getByFlowType((node?.type as string) ?? '');
      return reg?.allowSelfLoop === true;
    },
    [nodesRef]
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
          const targetType = targetId ? resolveTargetType(targetId, locale) : undefined;
          // Merge: previous display fields → fresh structural fields → explicit display overrides → derived type
          return {
            ...n,
            data: { ...n.data, ...freshData, ...displayUpdates, ...(targetType && { targetType }) },
          };
        });
        updateDirty(next, edgesRef.current);
        return next;
      });
      // Let the node definition handle config change side-effects
      const nodeType = nodesRef.current.find((n) => n.id === nodeId)?.type ?? '';
      const reg = defaultRegistry.getByFlowType(nodeType);
      const def = reg ? nodeDefinitions.find((d) => d.type === (reg.apiType ?? reg.type)) : null;
      def?.onConfigChange?.(nodeId, configUpdates, {
        setEdges,
        updateNodeInternals,
        nodesRef,
        updateDirty,
      });
      if (configUpdates.target_id) {
        requestAnimationFrame(() => updateNodeInternals(nodeId));
      }
    },
    [setNodes, setEdges, updateDirty, updateNodeInternals]
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
        const expand = { expand: ['extensions'] as string[] };
        switch (type) {
          case 'schedule':
            return await dialstack.schedules.list();
          case 'user':
            return (await dialstack.users.list(expand)).map((u) => ({
              id: u.id,
              name: u.name || locale.combobox.noName,
              extension_number: u.extensions?.data?.[0]?.number,
            }));
          case 'ring_group':
            return await dialstack.ringGroups.list(expand);
          case 'dial_plan': {
            const all = await dialstack.dialPlans.list(expand);
            const currentId = dialPlanMeta?.id ?? dialPlanId;
            return all.filter((p) => p.id !== currentId);
          }
          case 'voice_app':
            return await dialstack.voiceApps.list(expand);
          case 'shared_voicemail':
            return await dialstack.sharedVoicemailBoxes.list();
          case 'audio_clip':
            return await dialstack.audioClips.list();
          default:
            return [];
        }
      } catch {
        return [];
      }
    },
    [dialstack, dialPlanId, dialPlanMeta, locale]
  );

  // ---- Edit mode: save ----
  const handleSave = useCallback(async () => {
    try {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const payload = transformGraphToDialPlan(currentNodes, currentEdges, defaultRegistry);
      const saved = dialPlanId
        ? await dialstack.dialPlans.update(dialPlanId, payload)
        : await dialstack.dialPlans.create({ name: locale.status.newDialPlan, ...payload });
      initialGraphRef.current = { nodes: [...currentNodes], edges: [...currentEdges] };
      setIsDirty(false);
      callbacksRef.current.onDirtyChange?.(false);
      callbacksRef.current.onSave?.(saved as DialPlanData);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // Parse API error path (e.g. "/nodes/3/config/schedule_id: ...") to select the node
      const errorPayload = error.message.includes('/nodes/')
        ? transformGraphToDialPlan(nodesRef.current, edgesRef.current, defaultRegistry)
        : null;
      if (errorPayload) {
        const nodeMatch = error.message.match(/^\/nodes\/(\d+)\//);
        if (nodeMatch?.[1]) {
          const node = errorPayload.nodes[parseInt(nodeMatch[1], 10)];
          if (node) setSelectedNodeId(node.id);
        }
      }
      callbacksRef.current.onError?.(
        errorPayload ? new Error(formatValidationError(error.message, errorPayload.nodes)) : error
      );
      throw err;
    }
  }, [dialstack, dialPlanId]);

  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

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
          <span>{locale.status.loading}</span>
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
          <span>{locale.status.loadError}</span>
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
          <span>{locale.status.notFound}</span>
        </div>
      </div>
    );
  }

  const canvas = (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={editable ? handleNodesChange : undefined}
      onEdgesChange={editable ? onEdgesChange : undefined}
      onConnect={editable ? handleConnect : undefined}
      onReconnect={editable ? handleReconnect : undefined}
      onEdgeClick={editable ? handleEdgeClick : undefined}
      isValidConnection={editable ? isValidConnection : undefined}
      edgesReconnectable={editable}
      onNodeClick={editable ? handleEditNodeClick : onNodeClick ? handleViewNodeClick : undefined}
      onPaneClick={editable ? handlePaneClick : undefined}
      nodesDraggable={editable}
      nodesConnectable={editable}
      elementsSelectable={editable}
      selectionOnDrag={false}
      selectNodesOnDrag={false}
      panOnDrag={interactive}
      panOnScroll={interactive}
      zoomOnScroll={interactive}
      zoomOnPinch={interactive}
      zoomOnDoubleClick={interactive}
      preventScrolling={interactive}
      connectionLineType={ConnectionLineType.SmoothStep}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
      fitView
      fitViewOptions={{
        padding: interactive ? 0.2 : 0.15,
        minZoom: interactive ? 0.5 : 0,
        maxZoom: 1.5,
      }}
      minZoom={interactive ? 0.3 : 0}
      maxZoom={2}
      defaultEdgeOptions={{
        type: DIAL_PLAN_EDGE_TYPE,
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#94a3b8' },
      }}
      proOptions={{ hideAttribution: true }}
    >
      {showChrome && <Background gap={20} size={1} />}
      {showChrome && <Controls showInteractive={false} />}
      {editable && (
        <EditorToolbar
          onAutoLayout={handleAutoLayout}
          onSave={() => {
            handleSave().catch(() => {});
          }}
          isDirty={isDirty}
        />
      )}
    </ReactFlow>
  );

  return (
    <div
      className={`ds-dial-plan-editor ${mode === 'preview' ? 'ds-dial-plan-editor--preview' : ''} ${className || ''}`}
      style={style}
    >
      {editable && (
        <div className="ds-dial-plan-node-library-wrapper">
          <NodeLibrary registry={defaultRegistry} onAddNode={handleAddNode} />
        </div>
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
              onClose={() => {
                setSelectedNodeId(null);
                setNodes((prev) => prev.map((n) => (n.selected ? { ...n, selected: false } : n)));
              }}
              listResources={listResources}
              onCreateResource={onCreateResource}
              onOpenResource={onOpenResource}
              locale={locale}
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
                    <path d="M4 8h8v8h8" />
                    <polyline points="17 13 20 16 17 19" />
                  </svg>
                </span>
                <span className="ds-dial-plan-config-panel__header-label">
                  {locale.panel.connection}
                </span>
                <button
                  type="button"
                  className="ds-dial-plan-config-panel__delete"
                  onClick={() => handleDeleteEdge(selectedEdge.id)}
                  title={locale.panel.delete_}
                >
                  {trashIcon}
                </button>
                <button
                  type="button"
                  className="ds-dial-plan-config-panel__close"
                  onClick={() => {
                    setSelectedEdgeId(null);
                    setEdges((prev) =>
                      prev.map((e) => (e.selected ? { ...e, selected: false } : e))
                    );
                  }}
                  title={locale.panel.close}
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
                  <span className="ds-dial-plan-config-field__label">{locale.panel.from}</span>
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
                    <span className="ds-dial-plan-config-field__label">{locale.panel.exit}</span>
                    <span className="ds-dial-plan-edge-panel__value">
                      {(() => {
                        const handle = selectedEdge.sourceHandle;
                        const srcNode = nodes.find((n) => n.id === selectedEdge.source);
                        const srcReg = srcNode
                          ? defaultRegistry.getByFlowType(srcNode.type ?? '')
                          : null;
                        const def = srcReg
                          ? nodeDefinitions.find((d) => d.type === (srcReg.apiType ?? srcReg.type))
                          : null;
                        return (
                          def?.resolveExitLabel?.(handle) ??
                          srcReg?.exits.find((e) => e.id === handle)?.label ??
                          handle
                        );
                      })()}
                    </span>
                  </div>
                )}
                <div className="ds-dial-plan-config-field">
                  <span className="ds-dial-plan-config-field__label">{locale.panel.to}</span>
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
});

// ============================================================================
// Public component
// ============================================================================

/**
 * DialPlan renders a dial plan as an interactive flow diagram.
 *
 * @example
 * ```tsx
 * // View mode (default)
 * <DialPlan dialPlanId="dp_01abc" />
 *
 * // Edit mode
 * <DialPlan dialPlanId="dp_01abc" mode="edit" onSave={(plan) => console.log(plan)} />
 *
 * // Preview mode (static thumbnail for card lists)
 * <DialPlan dialPlanId="dp_01abc" mode="preview" />
 *
 * // Create mode
 * <DialPlan mode="edit" onSave={(plan) => console.log(plan)} />
 * ```
 */
const dialPlanStylesheets = [xyflowStyles, dialPlanStyles];

export const DialPlan = React.forwardRef<DialPlanHandle, DialPlanProps>((props, ref) => {
  const { dialstack } = useDialstackComponents();
  const appearance = useAppearance(dialstack);
  const instanceTheme = appearance?.theme === 'dark' ? 'dark' : 'light';
  const theme = props.theme ?? instanceTheme;

  return (
    <ShadowContainer
      stylesheets={dialPlanStylesheets}
      className={props.className}
      style={{ width: '100%', height: '100%', flex: 1, minHeight: 0, ...props.style }}
    >
      <div
        data-theme={theme}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <ReactFlowProvider>
          <DialPlanInner ref={ref} {...props} />
        </ReactFlowProvider>
      </div>
    </ShadowContainer>
  );
});

DialPlan.displayName = 'DialPlan';
