import type { NodeTypes, Edge } from '@xyflow/react';
import type { NodeTypeRegistration } from './registry-types';
import type { DialPlanNode } from '../../types/dial-plan';

export class NodeTypeRegistry {
  private byType = new Map<string, NodeTypeRegistration>();
  private byFlowType = new Map<string, NodeTypeRegistration>();

  register(registration: NodeTypeRegistration): void {
    this.byType.set(registration.type, registration);
    this.byFlowType.set(registration.flowType, registration);
  }

  get(type: string): NodeTypeRegistration | undefined {
    return this.byType.get(type);
  }

  getByFlowType(flowType: string): NodeTypeRegistration | undefined {
    return this.byFlowType.get(flowType);
  }

  getAll(): NodeTypeRegistration[] {
    return Array.from(this.byType.values());
  }

  getNodeTypesMap(): NodeTypes {
    const map: NodeTypes = {};
    for (const reg of this.byType.values()) {
      map[reg.flowType] = reg.component;
    }
    return map;
  }

  createEdgesForNode(node: DialPlanNode, nodeMap: Map<string, DialPlanNode>): Edge[] {
    const reg = this.byType.get(node.type);
    if (!reg) return [];

    const edges: Edge[] = [];
    for (const exit of reg.exits) {
      const targetId = (node.config as unknown as Record<string, unknown>)[exit.configKey] as
        | string
        | undefined;
      if (targetId && nodeMap.has(targetId)) {
        edges.push({
          id: `${node.id}-${exit.id}->${targetId}`,
          source: node.id,
          target: targetId,
          sourceHandle: exit.id,
          type: 'smoothstep',
        });
      }
    }
    return edges;
  }
}
