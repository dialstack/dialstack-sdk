/**
 * The call activity components: `<ToCallBack>`, `<CallAnalytics>` and
 * `<DeviceHealth>`. Unread voicemail is `<Voicemails>` with its card
 * options.
 *
 * Their own entry point; each needs an initialized instance via
 * `<DialstackComponentsProvider>` from `@dialstack/sdk-react`.
 *
 * @packageDocumentation
 */

export { ToCallBack, CallAnalytics, DeviceHealth } from './react/CallActivity';
export type {
  CallActivityComponentProps,
  ToCallBackProps,
  CallAnalyticsProps,
  DeviceHealthProps,
} from './react/CallActivity';
