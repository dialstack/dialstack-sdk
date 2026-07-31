/**
 * In-call microphone/speaker picker. Native `<select>`s rather than the SDK's
 * dial-plan-local `cmdk` combobox, which would need a whole popover style block; a
 * `<select>` also brings keyboard nav and screen-reader support for free.
 */

import React from 'react';
import { useAudioDevices } from '../provider/AudioDevicesProvider';
import { useSoftphone } from '../provider/SoftphoneProvider';

export const AudioDevicePicker: React.FC = () => {
  const { t } = useSoftphone();
  const {
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
  } = useAudioDevices();

  return (
    /* No aria-label: it would duplicate the toggle button's accessible name. */
    <div className="ds-devices" role="group">
      {inputLost && (
        <div className="ds-device-alert" role="alert">
          {t('audioMicrophoneLost')}
        </div>
      )}

      <label className="ds-device-row">
        <span className="ds-device-label">{t('audioMicrophone')}</span>
        <select
          className="ds-device-select"
          aria-label={t('audioMicrophone')}
          value={inputDeviceId ?? ''}
          onChange={(e) => selectInputDevice(e.target.value || null)}
        >
          <option value="">{t('audioSystemDefault')}</option>
          {inputs.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || t('audioUnnamedDevice')}
            </option>
          ))}
        </select>
      </label>

      <label className="ds-device-row">
        <span className="ds-device-label">{t('audioSpeaker')}</span>
        <select
          className="ds-device-select"
          aria-label={t('audioSpeaker')}
          value={outputDeviceId ?? ''}
          disabled={!outputSelectionSupported}
          onChange={(e) => selectOutputDevice(e.target.value || null)}
        >
          <option value="">{t('audioSystemDefault')}</option>
          {outputs.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || t('audioUnnamedDevice')}
            </option>
          ))}
        </select>
      </label>

      {!enumerationSupported && <p className="ds-device-hint">{t('audioDevicesUnsupported')}</p>}
      {!outputSelectionSupported && (
        <p className="ds-device-hint">{t('audioSpeakerUnsupported')}</p>
      )}
      {labelsHidden && <p className="ds-device-hint">{t('audioLabelsHidden')}</p>}
    </div>
  );
};
