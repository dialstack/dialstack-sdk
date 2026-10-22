import { ClientInfo, type ClientAppInfo } from '@dialstack/sdk-js/pure';
import { PACKAGE_VERSION } from './version';

/**
 * The `DialStack-Client` value the native phone reports. The phone always backs
 * the softphone here, whichever of createPhone() and the provider built it. It
 * must start with `sdk-native/`: sdk-webrtc's phone leaves out its own, stale,
 * version when it does.
 */
export function nativeClient(appInfo?: ClientAppInfo): string {
  return ClientInfo.forComponent('sdk-native', PACKAGE_VERSION, 'softphone', appInfo);
}
