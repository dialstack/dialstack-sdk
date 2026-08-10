/**
 * `<DialPlan>` — the visual dial-plan editor.
 *
 * Its own entry point because it is the only component needing `@xyflow/react`
 * and `dagre`, and it renders ~4k lines of canvas UI. Reached through a root
 * barrel it made every consumer's bundler treat those dependencies as live, even
 * an app rendering only a softphone.
 *
 * `ListResourcesOptions` and `ResourceType` are also exported from the root, on
 * purpose: they type the `listResources` callback a host passes in, and a host
 * wiring that callback may never import this module.
 *
 * Despite rendering its own canvas rather than a custom element, this is the
 * heaviest consumer of the instance in the package — 14 distinct calls across 10
 * resources — so it needs `<DialstackComponentsProvider>` from
 * `@dialstack/sdk-react`.
 *
 * @packageDocumentation
 */

export { DialPlan } from './react/DialPlan';
export type { DialPlanProps } from './react/DialPlan';
export type { ListResourcesOptions, ResourceType } from './react/dial-plan/registry-types';

// Dial-plan resource types, so a host can type its own dial-plan state without
// also importing the browser package.
export type {
  DialPlan as DialPlanData,
  DialPlanNode,
  DialPlanNodeType,
  ScheduleNode,
  InternalDialNode,
  RingAllUsersNode,
  ExternalDialNode,
  ScheduleNodeConfig,
  InternalDialNodeConfig,
  RingAllUsersNodeConfig,
  ExternalDialNodeConfig,
  VoiceAppNodeData,
  DialPlanMode,
  DialPlanHandle,
} from '@dialstack/sdk-js';
