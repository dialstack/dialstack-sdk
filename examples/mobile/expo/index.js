// Install the browser-shaped WebRTC globals (RTCPeerConnection, MediaStream,
// navigator.mediaDevices, …) that react-native-webrtc provides. The DialStack
// SDK core is written to the standard WebRTC surface and reads these globals at
// call time, so registerGlobals() MUST run before the SDK is used — do it here
// at the app entry, before anything imports the SDK.
import { registerGlobals } from 'react-native-webrtc';

registerGlobals();

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
