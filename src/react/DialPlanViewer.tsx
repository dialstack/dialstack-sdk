/**
 * DialPlanViewer Component
 *
 * A React component that renders a dial plan as an interactive flow diagram
 * using React Flow. Fetches dial plan data from the DialStack API and displays
 * it with support for view-only mode, pan/zoom, and optional minimap.
 */

import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type NodeTypes,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useDialstackComponents } from './DialstackComponentsProvider';
import { transformDialPlanToGraph, type DialPlanGraphNode } from '../utils/dial-plan-graph';
import { StartNode } from './dial-plan/StartNode';
import { ScheduleNode } from './dial-plan/ScheduleNode';
import { InternalDialNode } from './dial-plan/InternalDialNode';
import { injectDialPlanStyles } from './dial-plan/styles';
import type {
  DialPlan,
  DialPlanViewerProps,
  DialPlanLocale,
  ScheduleNodeData,
  InternalDialNodeData,
} from '../types/dial-plan';

// Default locale strings for dial plan nodes
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
    holiday: 'Holiday',
    next: 'No Answer',
    timeout: 'Timeout',
  },
};

// Types for API responses
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

// Custom node types for React Flow
const nodeTypes: NodeTypes = {
  start: StartNode,
  schedule: ScheduleNode,
  internalDial: InternalDialNode,
};

/**
 * DialPlanViewer displays a dial plan as an interactive flow diagram.
 *
 * Must be used within a DialstackComponentsProvider.
 *
 * @example
 * ```tsx
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <DialPlanViewer
 *     dialPlanId="dp_01abc..."
 *     showMinimap
 *     onNodeClick={(nodeId, node) => console.log('Clicked:', nodeId)}
 *     onLoadError={(error) => console.error('Failed to load:', error)}
 *   />
 * </DialstackComponentsProvider>
 * ```
 */
export const DialPlanViewer: React.FC<DialPlanViewerProps> = ({
  dialPlanId,
  readonly = true,
  showMinimap = false,
  locale = defaultDialPlanLocale,
  onNodeClick,
  onLoaderStart,
  onLoaderEnd,
  onLoadError,
  className,
  style,
}) => {
  const { dialstack } = useDialstackComponents();
  const [dialPlan, setDialPlan] = useState<DialPlan | null>(null);
  const [resourceMaps, setResourceMaps] = useState<ResourceMaps>({
    schedules: new Map(),
    users: new Map(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Store callbacks in refs to avoid triggering refetches when callbacks change
  const onLoaderStartRef = useRef(onLoaderStart);
  const onLoaderEndRef = useRef(onLoaderEnd);
  const onLoadErrorRef = useRef(onLoadError);

  useEffect(() => {
    onLoaderStartRef.current = onLoaderStart;
    onLoaderEndRef.current = onLoaderEnd;
    onLoadErrorRef.current = onLoadError;
  });

  // Inject styles on mount
  useEffect(() => {
    injectDialPlanStyles();
  }, []);

  // Fetch dial plan and related resources from API
  useEffect(() => {
    let cancelled = false;

    async function fetchDialPlanAndResources() {
      setIsLoading(true);
      setError(null);
      onLoaderStartRef.current?.();

      try {
        // Fetch the dial plan
        const response = await dialstack.fetchApi(`/v1/dialplans/${dialPlanId}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to load dial plan: ${response.status}`);
        }

        const data = (await response.json()) as DialPlan;

        if (cancelled) return;

        // Extract schedule IDs and user IDs from the dial plan
        const scheduleIds = new Set<string>();
        const userIds = new Set<string>();

        for (const node of data.nodes) {
          if (node.type === 'schedule') {
            scheduleIds.add(node.config.schedule_id);
          } else if (node.type === 'internal_dial') {
            userIds.add(node.config.target_id);
          }
        }

        // Fetch each schedule and user by ID in parallel
        const schedulePromises = Array.from(scheduleIds).map(async (id) => {
          const response = await dialstack.fetchApi(`/v1/schedules/${id}`);
          if (response.ok) {
            return (await response.json()) as Schedule;
          }
          return null;
        });

        const userPromises = Array.from(userIds).map(async (id) => {
          const response = await dialstack.fetchApi(`/v1/users/${id}`);
          if (response.ok) {
            return (await response.json()) as User;
          }
          return null;
        });

        const [schedules, users] = await Promise.all([
          Promise.all(schedulePromises),
          Promise.all(userPromises),
        ]);

        if (cancelled) return;

        // Build lookup maps
        const scheduleMap = new Map<string, Schedule>();
        const userMap = new Map<string, User>();

        for (const schedule of schedules) {
          if (schedule) {
            scheduleMap.set(schedule.id, schedule);
          }
        }

        for (const user of users) {
          if (user) {
            userMap.set(user.id, user);
          }
        }

        if (!cancelled) {
          setDialPlan(data);
          setResourceMaps({ schedules: scheduleMap, users: userMap });
          setIsLoading(false);
          onLoaderEndRef.current?.(data);
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
          setIsLoading(false);
          onLoadErrorRef.current?.(error);
        }
      }
    }

    fetchDialPlanAndResources();

    return () => {
      cancelled = true;
    };
  }, [dialstack, dialPlanId]);

  // Transform dial plan to React Flow nodes and edges, enriched with resource names and locale
  const { nodes, edges } = useMemo(() => {
    if (!dialPlan) return { nodes: [], edges: [] };

    const result = transformDialPlanToGraph(dialPlan);

    // Enrich nodes with resolved names and locale
    const enrichedNodes = result.nodes.map((node: DialPlanGraphNode) => {
      if (node.type === 'start') {
        return {
          ...node,
          data: {
            ...node.data,
            locale,
          },
        };
      } else if (node.type === 'schedule') {
        const data = node.data as ScheduleNodeData;
        const schedule = resourceMaps.schedules.get(data.scheduleId);
        return {
          ...node,
          data: {
            ...data,
            scheduleName: schedule?.name,
            locale,
          },
        };
      } else if (node.type === 'internalDial') {
        const data = node.data as InternalDialNodeData;
        const user = resourceMaps.users.get(data.targetId);
        return {
          ...node,
          data: {
            ...data,
            targetName: user?.name || user?.email,
            targetType: 'User',
            locale,
          },
        };
      }
      return node;
    });

    return { nodes: enrichedNodes, edges: result.edges };
  }, [dialPlan, resourceMaps, locale]);

  // Handle node click events
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!onNodeClick || !dialPlan) return;

      // Skip the synthetic start node
      if (node.id === '__start__') return;

      // Find the original dial plan node
      const originalNode = dialPlan.nodes.find((n) => n.id === node.id);
      if (originalNode) {
        onNodeClick(node.id, originalNode);
      }
    },
    [onNodeClick, dialPlan]
  );

  // Minimap node color based on type
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

  // Loading state
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

  // Error state
  if (error) {
    return (
      <div
        className={`ds-dial-plan-viewer ds-dial-plan-viewer--error ${className || ''}`}
        style={style}
      >
        <div className="ds-dial-plan-viewer__error">
          <span>Failed to load dial plan</span>
          <span className="ds-dial-plan-viewer__error-message">{error.message}</span>
        </div>
      </div>
    );
  }

  // No data state (shouldn't normally happen)
  if (!dialPlan) {
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

  return (
    <div className={`ds-dial-plan-viewer ${className || ''}`} style={style}>
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick ? handleNodeClick : undefined}
        nodesDraggable={!readonly}
        nodesConnectable={!readonly}
        elementsSelectable={!readonly}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.5,
          maxZoom: 1.5,
        }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: '#94a3b8',
          },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        {showMinimap && (
          <MiniMap nodeColor={minimapNodeColor} maskColor="rgba(0, 0, 0, 0.1)" pannable zoomable />
        )}
      </ReactFlow>
    </div>
  );
};
