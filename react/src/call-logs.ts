/**
 * `<CallLogs>` — the call-log list.
 *
 * Its own entry point so importing it does not make the dial-plan editor's
 * `@xyflow/react`/`dagre`/`cmdk` reachable. Needs an initialized instance: wrap in
 * `<DialstackComponentsProvider>` from `@dialstack/sdk-react`.
 *
 * @packageDocumentation
 */

export { CallLogs } from './react/CallLogs';
export type { CallLogsProps } from './react/CallLogs';
