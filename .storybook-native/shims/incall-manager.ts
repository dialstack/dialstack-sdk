// Native-only audio routing with no web equivalent. SoftphoneProvider imports it
// at module scope, so the module graph pulls it in even for stories that render
// only the presentational views.
const InCallManager = {
  start: () => {},
  stop: () => {},
  startRingtone: () => {},
  stopRingtone: () => {},
  setForceSpeakerphoneOn: () => {},
  setSpeakerphoneOn: () => {},
};

export default InCallManager;
