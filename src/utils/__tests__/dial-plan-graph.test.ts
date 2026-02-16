/**
 * Tests for dial plan graph transformation utilities
 */

import {
  transformDialPlanToGraph,
  applyAutoLayout,
  getNodeLabel,
  getEdgeLabel,
} from '../dial-plan-graph';
import type { DialPlan } from '../../types/dial-plan';

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
          holiday: 'voicemail',
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
      const { nodes } = transformDialPlanToGraph(sampleDialPlan);

      const startNode = nodes.find((n) => n.id === '__start__');
      expect(startNode).toBeDefined();
      expect(startNode?.type).toBe('start');
      expect(startNode?.data.label).toBe('Start');
    });

    it('should create an edge from start to entry node', () => {
      const { edges } = transformDialPlanToGraph(sampleDialPlan);

      const startEdge = edges.find((e) => e.source === '__start__');
      expect(startEdge).toBeDefined();
      expect(startEdge?.target).toBe('check_hours');
    });

    it('should create nodes for each dial plan node', () => {
      const { nodes } = transformDialPlanToGraph(sampleDialPlan);

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
      const { edges } = transformDialPlanToGraph(sampleDialPlan);

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

      // Check for holiday exit edge
      const holidayEdge = edges.find(
        (e) => e.source === 'check_hours' && e.sourceHandle === 'holiday'
      );
      expect(holidayEdge).toBeDefined();
      expect(holidayEdge?.target).toBe('voicemail');
    });

    it('should create edges for internal dial next exits', () => {
      const { edges } = transformDialPlanToGraph(sampleDialPlan);

      const nextEdge = edges.find((e) => e.source === 'reception' && e.sourceHandle === 'next');
      expect(nextEdge).toBeDefined();
      expect(nextEdge?.target).toBe('voicemail');
    });

    it('should not create edges for undefined exits', () => {
      const { edges } = transformDialPlanToGraph(sampleDialPlan);

      // voicemail node has no next exit
      const voicemailEdge = edges.find((e) => e.source === 'voicemail');
      expect(voicemailEdge).toBeUndefined();
    });

    it('should apply auto-layout when positions are not specified', () => {
      const { nodes } = transformDialPlanToGraph(sampleDialPlan);

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

      const { nodes } = transformDialPlanToGraph(dialPlanWithPositions);

      // Check that specified positions are preserved (excluding start node)
      const checkHoursNode = nodes.find((n) => n.id === 'check_hours');
      expect(checkHoursNode?.position.x).toBe(0);
      expect(checkHoursNode?.position.y).toBe(0);

      const receptionNode = nodes.find((n) => n.id === 'reception');
      expect(receptionNode?.position.x).toBe(100);
      expect(receptionNode?.position.y).toBe(50);
    });
  });

  describe('getNodeLabel', () => {
    it('should return Schedule label for schedule nodes', () => {
      const node = sampleDialPlan.nodes[0]; // check_hours
      expect(getNodeLabel(node)).toBe('Schedule');
    });

    it('should return Dial label for internal dial nodes', () => {
      const node = sampleDialPlan.nodes[1]; // reception
      expect(getNodeLabel(node)).toBe('Dial');
    });
  });

  describe('getEdgeLabel', () => {
    it('should return correct labels for schedule exits', () => {
      expect(getEdgeLabel('open')).toBe('Open');
      expect(getEdgeLabel('closed')).toBe('Closed');
      expect(getEdgeLabel('holiday')).toBe('Holiday');
    });

    it('should return correct labels for internal dial exits', () => {
      expect(getEdgeLabel('next')).toBe('No Answer');
      expect(getEdgeLabel('timeout')).toBe('Timeout');
    });

    it('should return the exit type for unknown types', () => {
      expect(getEdgeLabel('unknown')).toBe('unknown');
    });
  });

  describe('applyAutoLayout', () => {
    it('should position nodes without overlap', () => {
      const { nodes, edges } = transformDialPlanToGraph(sampleDialPlan);
      const { nodes: layoutedNodes } = applyAutoLayout(nodes, edges);

      // Check that no two nodes have the same position
      const positions = layoutedNodes.map((n) => `${n.position.x},${n.position.y}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(positions.length);
    });

    it('should arrange nodes in a left-to-right flow', () => {
      const { nodes, edges } = transformDialPlanToGraph(sampleDialPlan);
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

      const { nodes, edges } = transformDialPlanToGraph(emptyDialPlan);

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

      const { edges } = transformDialPlanToGraph(dialPlanWithMissingEntry);

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
              holiday: undefined,
            },
          },
        ],
      };

      const { edges } = transformDialPlanToGraph(dialPlanWithBadEdge);

      // Should not create edge to nonexistent node
      const badEdge = edges.find((e) => e.target === 'nonexistent');
      expect(badEdge).toBeUndefined();
    });
  });
});
