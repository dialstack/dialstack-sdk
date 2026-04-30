/**
 * Tests for dial plan graph transformation utilities
 */

import {
  transformDialPlanToGraph,
  transformGraphToDialPlan,
  applyAutoLayout,
  getNodeLabel,
  getEdgeLabel,
} from '../dial-plan-graph';
import type { DialPlan } from '../../types/dial-plan';
import { defaultRegistry } from '../../react/dial-plan/default-registry';

describe('dial-plan-graph', () => {
  const sampleDialPlan: DialPlan = {
    id: 'dp_test',
    name: 'Test Dial Plan',
    entry_node: 'check_hours',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    nodes: [
      {
        id: 'check_hours',
        type: 'schedule',
        config: {
          schedule_id: 'sched_1',
          open: 'reception',
          closed: 'voicemail',
        },
      },
      {
        id: 'reception',
        type: 'internal_dial',
        config: {
          target_id: 'user_1',
          timeout: 30,
          next: 'voicemail',
        },
      },
      {
        id: 'voicemail',
        type: 'internal_dial',
        config: {
          target_id: 'user_vm',
        },
      },
    ],
  };

  describe('transformDialPlanToGraph', () => {
    it('should create a start node', () => {
      const { nodes } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);

      const startNode = nodes.find((n) => n.id === '__start__');
      expect(startNode).toBeDefined();
      expect(startNode?.type).toBe('start');
      expect(startNode?.data.label).toBe('Start');
    });

    it('should create an edge from start to entry node', () => {
      const { edges } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);

      const startEdge = edges.find((e) => e.source === '__start__');
      expect(startEdge).toBeDefined();
      expect(startEdge?.target).toBe('check_hours');
    });

    it('should create nodes for each dial plan node', () => {
      const { nodes } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);

      // Should have 4 nodes: start + 3 dial plan nodes
      expect(nodes).toHaveLength(4);

      const scheduleNode = nodes.find((n) => n.id === 'check_hours');
      expect(scheduleNode).toBeDefined();
      expect(scheduleNode?.type).toBe('schedule');

      const receptionNode = nodes.find((n) => n.id === 'reception');
      expect(receptionNode).toBeDefined();
      expect(receptionNode?.type).toBe('internalDial');

      const voicemailNode = nodes.find((n) => n.id === 'voicemail');
      expect(voicemailNode).toBeDefined();
      expect(voicemailNode?.type).toBe('internalDial');
    });

    it('should create edges for schedule node exits', () => {
      const { edges } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);

      // Check for open exit edge
      const openEdge = edges.find((e) => e.source === 'check_hours' && e.sourceHandle === 'open');
      expect(openEdge).toBeDefined();
      expect(openEdge?.target).toBe('reception');

      // Check for closed exit edge
      const closedEdge = edges.find(
        (e) => e.source === 'check_hours' && e.sourceHandle === 'closed'
      );
      expect(closedEdge).toBeDefined();
      expect(closedEdge?.target).toBe('voicemail');
    });

    it('should create edges for internal dial next exits', () => {
      const { edges } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);

      const nextEdge = edges.find((e) => e.source === 'reception' && e.sourceHandle === 'next');
      expect(nextEdge).toBeDefined();
      expect(nextEdge?.target).toBe('voicemail');
    });

    it('should not create edges for undefined exits', () => {
      const { edges } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);

      // voicemail node has no next exit
      const voicemailEdge = edges.find((e) => e.source === 'voicemail');
      expect(voicemailEdge).toBeUndefined();
    });

    it('should apply auto-layout when positions are not specified', () => {
      const { nodes } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);

      // All nodes should have positions
      for (const node of nodes) {
        expect(node.position).toBeDefined();
        expect(typeof node.position.x).toBe('number');
        expect(typeof node.position.y).toBe('number');
      }
    });

    it('should preserve positions when specified', () => {
      const dialPlanWithPositions: DialPlan = {
        ...sampleDialPlan,
        nodes: sampleDialPlan.nodes.map((node, index) => ({
          ...node,
          position: { x: index * 100, y: index * 50 },
        })),
      };

      const { nodes } = transformDialPlanToGraph(dialPlanWithPositions, defaultRegistry);

      // Check that specified positions are preserved (excluding start node)
      const checkHoursNode = nodes.find((n) => n.id === 'check_hours');
      expect(checkHoursNode?.position.x).toBe(0);
      expect(checkHoursNode?.position.y).toBe(0);

      const receptionNode = nodes.find((n) => n.id === 'reception');
      expect(receptionNode?.position.x).toBe(100);
      expect(receptionNode?.position.y).toBe(50);
    });
  });

  describe('transformGraphToDialPlan', () => {
    it('converts React Flow nodes and edges back to DialPlanData', () => {
      // Build graph from sample dial plan then convert back
      const { nodes, edges } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);
      const result = transformGraphToDialPlan(nodes, edges, defaultRegistry);

      expect(result.entry_node).toBe('check_hours');
      expect(result.nodes).toHaveLength(3);

      const checkHours = result.nodes.find((n) => n.id === 'check_hours');
      expect(checkHours).toBeDefined();
      expect(checkHours?.type).toBe('schedule');
      expect((checkHours?.config as Record<string, unknown>)['schedule_id']).toBe('sched_1');

      // Verify positions are present
      expect(checkHours?.position).toBeDefined();
    });

    it('filters out the synthetic start node', () => {
      // Only the __start__ node, no real nodes
      const nodes = [
        {
          id: '__start__',
          type: 'start',
          position: { x: 0, y: 0 },
          data: { label: 'Start' },
        },
      ];
      const result = transformGraphToDialPlan(nodes, [], defaultRegistry);

      expect(result.nodes).toHaveLength(0);
      expect(result.entry_node).toBe('');
    });

    it('reconstructs exit config from edges', () => {
      const { nodes, edges } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);
      const result = transformGraphToDialPlan(nodes, edges, defaultRegistry);

      const scheduleNode = result.nodes.find((n) => n.id === 'check_hours');
      expect(scheduleNode).toBeDefined();
      const config = scheduleNode?.config as Record<string, unknown>;
      expect(config['open']).toBe('reception');
      expect(config['closed']).toBe('voicemail');
    });

    it('clears exit config when edge is removed', () => {
      const { nodes, edges } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);
      // Remove the open->reception edge
      const filteredEdges = edges.filter(
        (e) => !(e.source === 'check_hours' && e.sourceHandle === 'open')
      );

      const result = transformGraphToDialPlan(nodes, filteredEdges, defaultRegistry);

      const scheduleNode = result.nodes.find((n) => n.id === 'check_hours');
      const config = scheduleNode?.config as Record<string, unknown>;
      // open should be cleared since the edge was removed
      expect(config['open']).toBeUndefined();
      // closed should still be set
      expect(config['closed']).toBe('voicemail');
    });

    // DIA-730: voice_app is its own first-class node type. Round-trip preserves
    // the new shape (voice_app_id, no timeout, no target_id collapse).
    it('round-trips voice_app nodes without collapsing to internal_dial', () => {
      const plan: DialPlan = {
        id: 'dp_va',
        name: 'VA Plan',
        entry_node: 'ai',
        created_at: '2026-04-27T00:00:00Z',
        updated_at: '2026-04-27T00:00:00Z',
        nodes: [
          {
            id: 'ai',
            type: 'voice_app',
            config: { voice_app_id: 'va_01k' },
          },
        ],
      };

      const { nodes, edges } = transformDialPlanToGraph(plan, defaultRegistry);
      const flowNode = nodes.find((n) => n.id === 'ai');
      expect(flowNode?.type).toBe('voiceApp');

      const result = transformGraphToDialPlan(nodes, edges, defaultRegistry);
      const ai = result.nodes.find((n) => n.id === 'ai');
      expect(ai?.type).toBe('voice_app');
      const config = ai?.config as Record<string, unknown>;
      expect(config['voice_app_id']).toBe('va_01k');
      expect(config['target_id']).toBeUndefined();
      expect(config['timeout']).toBeUndefined();
    });

    // DIA-730: legacy plans store voice apps as `internal_dial` with a `va_`
    // `target_id`. Loading promotes them to `voice_app`; saving writes the new
    // shape — implicit migration on first edit.
    it('promotes legacy internal_dial+va_ to voice_app on load and save', () => {
      const plan: DialPlan = {
        id: 'dp_legacy_va',
        name: 'Legacy VA Plan',
        entry_node: 'ai',
        created_at: '2026-04-27T00:00:00Z',
        updated_at: '2026-04-27T00:00:00Z',
        nodes: [
          {
            id: 'ai',
            type: 'internal_dial',
            config: { target_id: 'va_01k', timeout: 30, next: 'fallback' },
          },
          {
            id: 'fallback',
            type: 'internal_dial',
            config: { target_id: 'user_01h', timeout: 30 },
          },
        ],
      };

      const { nodes, edges } = transformDialPlanToGraph(plan, defaultRegistry);
      const flowNode = nodes.find((n) => n.id === 'ai');
      expect(flowNode?.type).toBe('voiceApp');
      const nextEdge = edges.find((e) => e.source === 'ai' && e.sourceHandle === 'next');
      expect(nextEdge?.target).toBe('fallback');

      const result = transformGraphToDialPlan(nodes, edges, defaultRegistry);
      const ai = result.nodes.find((n) => n.id === 'ai');
      expect(ai?.type).toBe('voice_app');
      const config = ai?.config as Record<string, unknown>;
      expect(config['voice_app_id']).toBe('va_01k');
      expect(config['mode']).toBe('control');
      expect(config['next']).toBe('fallback');
      expect(config['target_id']).toBeUndefined();
      expect(config['timeout']).toBeUndefined();
    });

    // DIA-730: voice_app's "No Answer" exit must round-trip via the `next` edge.
    it('round-trips voice_app next exit through edges', () => {
      const plan: DialPlan = {
        id: 'dp_va_next',
        name: 'VA Plan',
        entry_node: 'ai',
        created_at: '2026-04-27T00:00:00Z',
        updated_at: '2026-04-27T00:00:00Z',
        nodes: [
          {
            id: 'ai',
            type: 'voice_app',
            config: { voice_app_id: 'va_01k', next: 'fallback' },
          },
          {
            id: 'fallback',
            type: 'internal_dial',
            config: { target_id: 'user_01h', timeout: 30 },
          },
        ],
      };

      const { nodes, edges } = transformDialPlanToGraph(plan, defaultRegistry);
      const nextEdge = edges.find((e) => e.source === 'ai' && e.sourceHandle === 'next');
      expect(nextEdge).toBeDefined();
      expect(nextEdge?.target).toBe('fallback');

      const result = transformGraphToDialPlan(nodes, edges, defaultRegistry);
      const ai = result.nodes.find((n) => n.id === 'ai');
      const config = ai?.config as Record<string, unknown>;
      expect(config['next']).toBe('fallback');
    });
  });

  describe('getNodeLabel', () => {
    it('should return Schedule label for schedule nodes', () => {
      const node = sampleDialPlan.nodes[0]; // check_hours
      expect(getNodeLabel(node)).toBe('Schedule');
    });

    it('should return Internal Extension label for internal dial nodes', () => {
      const node = sampleDialPlan.nodes[1]; // reception
      expect(getNodeLabel(node)).toBe('Internal Extension');
    });
  });

  describe('getEdgeLabel', () => {
    it('should return correct labels for schedule exits', () => {
      expect(getEdgeLabel('open')).toBe('Open');
      expect(getEdgeLabel('closed')).toBe('Closed');
    });

    it('should return correct labels for internal dial exits', () => {
      expect(getEdgeLabel('next')).toBe('Next');
      expect(getEdgeLabel('timeout')).toBe('Timeout');
    });

    it('should return the exit type for unknown types', () => {
      expect(getEdgeLabel('unknown')).toBe('unknown');
    });
  });

  describe('applyAutoLayout', () => {
    it('should position nodes without overlap', () => {
      const { nodes, edges } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);
      const { nodes: layoutedNodes } = applyAutoLayout(nodes, edges);

      // Check that no two nodes have the same position
      const positions = layoutedNodes.map((n) => `${n.position.x},${n.position.y}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(positions.length);
    });

    it('should arrange nodes in a left-to-right flow', () => {
      const { nodes, edges } = transformDialPlanToGraph(sampleDialPlan, defaultRegistry);
      const { nodes: layoutedNodes } = applyAutoLayout(nodes, edges);

      const startNode = layoutedNodes.find((n) => n.id === '__start__');
      const checkHoursNode = layoutedNodes.find((n) => n.id === 'check_hours');
      const receptionNode = layoutedNodes.find((n) => n.id === 'reception');

      // Start should be left of check_hours
      expect(startNode!.position.x).toBeLessThan(checkHoursNode!.position.x);
      // check_hours should be left of reception
      expect(checkHoursNode!.position.x).toBeLessThan(receptionNode!.position.x);
    });
  });

  describe('edge cases', () => {
    it('should handle empty nodes array', () => {
      const emptyDialPlan: DialPlan = {
        ...sampleDialPlan,
        nodes: [],
        entry_node: '',
      };

      const { nodes, edges } = transformDialPlanToGraph(emptyDialPlan, defaultRegistry);

      // Should only have the start node
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('__start__');

      // No edges since entry_node is empty
      expect(edges).toHaveLength(0);
    });

    it('should handle missing entry node reference', () => {
      const dialPlanWithMissingEntry: DialPlan = {
        ...sampleDialPlan,
        entry_node: 'nonexistent',
      };

      const { edges } = transformDialPlanToGraph(dialPlanWithMissingEntry, defaultRegistry);

      // Should not create edge to nonexistent node
      const startEdge = edges.find((e) => e.source === '__start__');
      expect(startEdge).toBeUndefined();
    });

    it('should handle edges pointing to nonexistent nodes', () => {
      const dialPlanWithBadEdge: DialPlan = {
        ...sampleDialPlan,
        nodes: [
          {
            id: 'check_hours',
            type: 'schedule',
            config: {
              schedule_id: 'sched_1',
              open: 'nonexistent',
              closed: undefined,
            },
          },
        ],
      };

      const { edges } = transformDialPlanToGraph(dialPlanWithBadEdge, defaultRegistry);

      // Should not create edge to nonexistent node
      const badEdge = edges.find((e) => e.target === 'nonexistent');
      expect(badEdge).toBeUndefined();
    });
  });
});
