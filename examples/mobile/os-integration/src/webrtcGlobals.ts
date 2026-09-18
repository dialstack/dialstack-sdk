import { registerGlobals } from '@livekit/react-native-webrtc';

// Installs RTCPeerConnection & co. on globalThis. Imported first by index.js so
// it runs before anything constructs a phone.
registerGlobals();
