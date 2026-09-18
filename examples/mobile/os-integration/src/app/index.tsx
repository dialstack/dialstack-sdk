import { Softphone } from '@dialstack/sdk-native';

/**
 * The phone screen: the SDK's batteries-included <Softphone> and nothing else.
 * It renders the dial pad, the incoming-call answer/decline UI, the in-call
 * controls and the E911 banner from call state — so this app adds no call UI of
 * its own. Answering here goes through the SDK call; the bridge observes the
 * call's own 'answered'/'ended' events and keeps the OS (Telecom/CallKit) session
 * in step, so the in-app and lock-screen paths converge without this screen
 * knowing about the bridge.
 *
 * The provider that owns the phone is in _layout.tsx.
 */
export default function Index() {
  return <Softphone />;
}
