/**
 * The call activity components: `<ToCallBack>`, `<CallAnalytics>` and
 * `<DevicesOffline>`. Unread voicemail is `<Voicemails>` with its card
 * options.
 *
 * Their own entry point; each needs an initialized instance via
 * `<DialstackComponentsProvider>` from `@dialstack/sdk-react`.
 *
 * @packageDocumentation
 */

export { ToCallBack, CallAnalytics, DevicesOffline } from './react/CallActivity';
export type {
  CallActivityComponentProps,
  ToCallBackProps,
  CallAnalyticsProps,
  DevicesOfflineProps,
} from './react/CallActivity';
