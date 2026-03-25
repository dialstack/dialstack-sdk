/**
 * Tests for NodeTypeRegistry
 */

import React from 'react';
import type { NodeProps } from '@xyflow/react';
import { NodeTypeRegistry } from '../dial-plan/registry';
import type { NodeTypeRegistration, ConfigPanelProps } from '../dial-plan/registry-types';
import type { DialPlanNode } from '../../types/dial-plan';

function createMockRegistration(type: string, flowType: string): NodeTypeRegistration {
  return {
    type,
    flowType,
    label: `${type} label`,
    description: `${type} description`,
    icon: React.createElement('span', null, type),
    color: '#000000',
    component: (_props: NodeProps) => null,
    configPanel: (_props: ConfigPanelProps) => null,
    defaultConfig: {},
    exits: [],
    toFlowNode: (node: DialPlanNode) => ({ id: node.id }),
  };
}

describe('NodeTypeRegistry', () => {
  let registry: NodeTypeRegistry;

  beforeEach(() => {
    registry = new NodeTypeRegistry();
  });

  describe('register() and get()', () => {
    it('returns the registration for a registered type', () => {
      const reg = createMockRegistration('schedule', 'scheduleNode');
      registry.register(reg);
      expect(registry.get('schedule')).toBe(reg);
    });

    it('returns undefined for an unregistered type', () => {
      expect(registry.get('unknown_type')).toBeUndefined();
    });
  });

  describe('getByFlowType()', () => {
    it('returns the registration by flow type', () => {
      const reg = createMockRegistration('schedule', 'scheduleNode');
      registry.register(reg);
      expect(registry.getByFlowType('scheduleNode')).toBe(reg);
    });

    it('returns undefined for an unregistered flow type', () => {
      expect(registry.getByFlowType('unknownNode')).toBeUndefined();
    });
  });

  describe('getAll()', () => {
    it('returns an empty array when no types are registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('returns all registered types', () => {
      const reg1 = createMockRegistration('schedule', 'scheduleNode');
      const reg2 = createMockRegistration('internal_dial', 'internalDialNode');
      registry.register(reg1);
      registry.register(reg2);
      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(reg1);
      expect(all).toContain(reg2);
    });
  });

  describe('getNodeTypesMap()', () => {
    it('returns an empty object when no types are registered', () => {
      expect(registry.getNodeTypesMap()).toEqual({});
    });

    it('builds a React Flow nodeTypes map keyed by flowType', () => {
      const reg1 = createMockRegistration('schedule', 'scheduleNode');
      const reg2 = createMockRegistration('internal_dial', 'internalDialNode');
      registry.register(reg1);
      registry.register(reg2);
      const map = registry.getNodeTypesMap();
      expect(map['scheduleNode']).toBe(reg1.component);
      expect(map['internalDialNode']).toBe(reg2.component);
    });
  });

  describe('createEdgesForNode()', () => {
    it('returns empty array for an unregistered node type', () => {
      const node: DialPlanNode = {
        id: 'n1',
        type: 'schedule',
        config: { schedule_id: 'sched1', open: 'n2', closed: 'n3' },
      };
      const nodeMap = new Map<string, DialPlanNode>([['n1', node]]);
      // registry has no registrations — should return []
      expect(registry.createEdgesForNode(node, nodeMap)).toEqual([]);
    });

    it('creates edges for exits with existing target nodes', () => {
      const scheduleReg = createMockRegistration('schedule', 'scheduleNode');
      scheduleReg.exits = [
        { id: 'open', label: 'Open', configKey: 'open' },
        { id: 'closed', label: 'Closed', configKey: 'closed' },
      ];
      registry.register(scheduleReg);

      const node: DialPlanNode = {
        id: 'n1',
        type: 'schedule',
        config: { schedule_id: 'sched1', open: 'n2', closed: 'n3' },
      };
      const n2: DialPlanNode = {
        id: 'n2',
        type: 'internal_dial',
        config: { target_id: 'user1' },
      };
      const n3: DialPlanNode = {
        id: 'n3',
        type: 'internal_dial',
        config: { target_id: 'user2' },
      };
      const nodeMap = new Map<string, DialPlanNode>([
        ['n1', node],
        ['n2', n2],
        ['n3', n3],
      ]);

      const edges = registry.createEdgesForNode(node, nodeMap);
      expect(edges).toHaveLength(2);
      expect(edges[0]).toMatchObject({
        id: 'n1-open->n2',
        source: 'n1',
        target: 'n2',
        sourceHandle: 'open',
        type: 'smoothstep',
      });
      expect(edges[1]).toMatchObject({
        id: 'n1-closed->n3',
        source: 'n1',
        target: 'n3',
        sourceHandle: 'closed',
        type: 'smoothstep',
      });
    });

    it('skips edges where target node does not exist in nodeMap', () => {
      const scheduleReg = createMockRegistration('schedule', 'scheduleNode');
      scheduleReg.exits = [
        { id: 'open', label: 'Open', configKey: 'open' },
        { id: 'closed', label: 'Closed', configKey: 'closed' },
      ];
      registry.register(scheduleReg);

      const node: DialPlanNode = {
        id: 'n1',
        type: 'schedule',
        // 'closed' target 'n3' is not in nodeMap; 'open' config key is missing
        config: { schedule_id: 'sched1', open: 'n2' },
      };
      const n2: DialPlanNode = {
        id: 'n2',
        type: 'internal_dial',
        config: { target_id: 'user1' },
      };
      const nodeMap = new Map<string, DialPlanNode>([
        ['n1', node],
        ['n2', n2],
        // n3 intentionally absent
      ]);

      const edges = registry.createEdgesForNode(node, nodeMap);
      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({ source: 'n1', target: 'n2', sourceHandle: 'open' });
    });

    it('skips exits where config key is not set on the node', () => {
      const scheduleReg = createMockRegistration('schedule', 'scheduleNode');
      scheduleReg.exits = [
        { id: 'open', label: 'Open', configKey: 'open' },
        { id: 'closed', label: 'Closed', configKey: 'closed' },
      ];
      registry.register(scheduleReg);

      const node: DialPlanNode = {
        id: 'n1',
        type: 'schedule',
        config: { schedule_id: 'sched1' }, // no open or closed
      };
      const nodeMap = new Map<string, DialPlanNode>([['n1', node]]);

      expect(registry.createEdgesForNode(node, nodeMap)).toEqual([]);
    });
  });
});
