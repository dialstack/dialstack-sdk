// Native-only modules react-native-svg (15.16+) imports even from its web
// build: the sound TurboModule (through TurboModuleRegistry, which
// react-native-web does not export) and the asset registry, which only a React
// Native app installs. The stories draw no bundled image assets and play no
// sound, so neither has anything to do in a browser.
export const getAssetByID = (): undefined => undefined;

export default null;
