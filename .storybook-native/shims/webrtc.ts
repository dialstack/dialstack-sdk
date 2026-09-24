// Native WebRTC bindings have no web equivalent here; stories render UI only.
export class RTCPeerConnection {}
export class MediaStream {}
export class RTCSessionDescription {}
export class RTCIceCandidate {}
export const mediaDevices = {
  getUserMedia: () => Promise.reject(new Error('not available in Storybook')),
  enumerateDevices: () => Promise.resolve([]),
};
export const registerGlobals = (): void => {};
