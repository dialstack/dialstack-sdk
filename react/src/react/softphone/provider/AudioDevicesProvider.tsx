/**
 * Audio device selection for the web softphone.
 *
 * WEB ONLY. Must NOT be exported from `provider/index.ts` — that barrel is inlined
 * into the React Native package, and this file touches DOM APIs. Import it by path.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { storage as webStorage } from '../../../../../webrtc/src/platform';
import { useSoftphoneBase } from './SoftphoneProviderBase';

const INPUT_DEVICE_KEY = 'dialstack.softphone.input_device_id';
const OUTPUT_DEVICE_KEY = 'dialstack.softphone.output_device_id';

/** One selectable audio device. `label` is blank until mic permission is granted. */
export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

export interface UseAudioDevices {
  /** Available microphones. Empty when enumeration is unavailable. */
  inputs: AudioDeviceOption[];
  /** Available speakers. Always empty where `outputSelectionSupported` is false. */
  outputs: AudioDeviceOption[];
  /** Selected microphone, or null for the OS default. */
  inputDeviceId: string | null;
  /** Selected speaker, or null for the OS default. */
  outputDeviceId: string | null;
  /** Pick a microphone; null restores the OS default. */
  selectInputDevice: (deviceId: string | null) => void;
  /** Pick a speaker; null restores the OS default. */
  selectOutputDevice: (deviceId: string | null) => void;
  /** False where `HTMLMediaElement.setSinkId` is absent — iOS Safari, jsdom. */
  outputSelectionSupported: boolean;
  /** False where `navigator.mediaDevices.enumerateDevices` is absent. */
  enumerationSupported: boolean;
  /** True when devices exist but the browser is withholding their names. */
  labelsHidden: boolean;
  /** True once the captured microphone disappeared mid-call; cleared on re-pick. */
  inputLost: boolean;
}

const AudioDevicesContext = createContext<UseAudioDevices | null>(null);

// Blank deviceIds are the pre-permission placeholders; they can't be selected.
const toOptions = (devices: MediaDeviceInfo[]): AudioDeviceOption[] =>
  devices.filter((d) => d.deviceId !== '').map((d) => ({ deviceId: d.deviceId, label: d.label }));

export const AudioDevicesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { webrtcPhone, activeCall } = useSoftphoneBase();

  const [outputSelectionSupported] = useState(
    () =>
      typeof HTMLMediaElement !== 'undefined' &&
      typeof HTMLMediaElement.prototype.setSinkId === 'function'
  );
  const [enumerationSupported] = useState(
    () =>
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.enumerateDevices === 'function'
  );

  const [inputs, setInputs] = useState<AudioDeviceOption[]>([]);
  const [outputs, setOutputs] = useState<AudioDeviceOption[]>([]);
  const [labelsHidden, setLabelsHidden] = useState(false);
  const [inputLost, setInputLost] = useState(false);

  // Derived from the phone, not mirrored: a stale local copy dialed the wrong mic.
  const [, requestMicReread] = useState(0);
  // What is actually CAPTURED wins over what was asked for. Acquisition constrains with
  // `ideal`, so the OS can hand back a different device and the preference then names a
  // mic that was never opened — showing it made the picker claim a device the call wasn't
  // using. Falls back to the preference before any call, when nothing is captured yet.
  const inputDeviceId = activeCall
    ? (activeCall.effectiveAudioInputDeviceId ?? webrtcPhone?.audioInputDeviceId ?? null)
    : (webrtcPhone?.audioInputDeviceId ?? webStorage.getItem(INPUT_DEVICE_KEY));

  const [outputDeviceId, setOutputDeviceId] = useState<string | null>(() =>
    webStorage.getItem(OUTPUT_DEVICE_KEY)
  );

  // `activeCall`: ids stay hidden until mic permission, granted at call start.
  useEffect(() => {
    if (!enumerationSupported) return;
    let disposed = false;

    const refresh = async (): Promise<void> => {
      let devices: MediaDeviceInfo[];
      try {
        devices = await navigator.mediaDevices.enumerateDevices();
      } catch {
        return;
      }
      if (disposed) return;
      const audioIn = devices.filter((d) => d.kind === 'audioinput');
      const audioOut = devices.filter((d) => d.kind === 'audiooutput');
      setLabelsHidden(audioIn.length > 0 && audioIn.every((d) => d.label === ''));
      setInputs(toOptions(audioIn));

      setOutputs(outputSelectionSupported ? toOptions(audioOut) : []);
    };

    void refresh();
    const onDeviceChange = (): void => void refresh();
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => {
      disposed = true;
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
    };
  }, [enumerationSupported, outputSelectionSupported, activeCall]);

  // Keyed on the phone, not PhoneOptions: usePhone reads non-credential options once.
  useEffect(() => {
    if (!webrtcPhone || !outputDeviceId) return;
    webrtcPhone.setAudioOutputDevice(outputDeviceId);
  }, [webrtcPhone, outputDeviceId]);

  useEffect(() => {
    const saved = webStorage.getItem(INPUT_DEVICE_KEY);
    if (!webrtcPhone || !saved || webrtcPhone.audioInputDeviceId) return;
    // `seed`, not `set`: the setter probes the device, prompting for the mic at connect.
    webrtcPhone.seedAudioInputDevice(saved);
  }, [webrtcPhone]);

  // No auto-recovery: switching for the user fights a deliberate unplug and can loop
  useEffect(() => {
    if (!activeCall) return;
    const onLost = (): void => setInputLost(true);
    // The captured device is plain mutable state, so a switch driven from anywhere but
    // this provider (the public phone API, a host hotkey) needs a nudge to re-read it.
    const onChanged = (): void => requestMicReread((n: number) => n + 1);
    activeCall.on('audioInputLost', onLost);
    activeCall.on('audioInputChanged', onChanged);
    return () => {
      activeCall.off('audioInputLost', onLost);
      activeCall.off('audioInputChanged', onChanged);
      setInputLost(false);
    };
  }, [activeCall]);

  const selectInputDevice = useCallback(
    (deviceId: string | null) => {
      const reread = (): void => requestMicReread((n: number) => n + 1);
      void webrtcPhone?.setAudioInputDevice(deviceId).then(() => {
        // Cleared on success, not on attempt: `audioInputLost` fires once per capture
        // track, so a failed re-pick would erase the only warning for good and leave a
        // clean-looking UI over a dead track.
        setInputLost(false);
        // Persist only what the core accepted, so a rejected switch isn't remembered.
        if (deviceId) webStorage.setItem(INPUT_DEVICE_KEY, deviceId);
        else webStorage.removeItem(INPUT_DEVICE_KEY);
        reread();
      }, reread);
    },
    [webrtcPhone]
  );

  const selectOutputDevice = useCallback(
    (deviceId: string | null) => {
      setOutputDeviceId(deviceId);
      if (deviceId) webStorage.setItem(OUTPUT_DEVICE_KEY, deviceId);
      else webStorage.removeItem(OUTPUT_DEVICE_KEY);
      webrtcPhone?.setAudioOutputDevice(deviceId);
    },
    [webrtcPhone]
  );

  const value: UseAudioDevices = {
    inputs,
    outputs,
    inputDeviceId,
    outputDeviceId,
    selectInputDevice,
    selectOutputDevice,
    outputSelectionSupported,
    enumerationSupported,
    labelsHidden,
    inputLost,
  };

  return <AudioDevicesContext.Provider value={value}>{children}</AudioDevicesContext.Provider>;
};

/**
 * Audio device state for the built-in picker. Returns a disabled-but-safe shape
 * outside an `AudioDevicesProvider` so a custom layout that renders softphone
 * pieces without the web provider doesn't crash.
 */
export function useAudioDevices(): UseAudioDevices {
  const ctx = useContext(AudioDevicesContext);
  if (ctx) return ctx;
  return {
    inputs: [],
    outputs: [],
    inputDeviceId: null,
    outputDeviceId: null,
    selectInputDevice: () => {},
    selectOutputDevice: () => {},
    outputSelectionSupported: false,
    enumerationSupported: false,
    labelsHidden: false,
    inputLost: false,
  };
}
