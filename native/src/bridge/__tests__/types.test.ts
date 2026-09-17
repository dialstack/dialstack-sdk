import type { Call, DialStackPhone } from '@dialstack/sdk-webrtc';

import type { BridgeCall, BridgePhone } from '../NativeCallBridge';

// Compile-time only: the SDK's real classes must satisfy the bridge's ports.
// A type-level regression here surfaces in the integrator's app otherwise.
const phone: BridgePhone = null as unknown as DialStackPhone;
const call: BridgeCall = null as unknown as Call;

it('DialStackPhone and Call satisfy the bridge ports', () => {
  expect(phone).toBeNull();
  expect(call).toBeNull();
});
