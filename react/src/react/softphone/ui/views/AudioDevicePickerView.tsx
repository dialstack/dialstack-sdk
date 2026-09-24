import React from 'react';
import type { AudioDeviceOption } from '../../provider/AudioDevicesProvider';
import type { SoftphoneViewChrome } from './types';

export interface AudioDevicePickerViewProps extends Pick<SoftphoneViewChrome, 't'> {
  inputs: AudioDeviceOption[];
  outputs: AudioDeviceOption[];
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  onSelectInput: (deviceId: string | null) => void;
  onSelectOutput: (deviceId: string | null) => void;
  outputSelectionSupported: boolean;
  enumerationSupported: boolean;
  labelsHidden: boolean;
  inputLost: boolean;
}

export const AudioDevicePickerView: React.FC<AudioDevicePickerViewProps> = ({
  inputs,
  outputs,
  inputDeviceId,
  outputDeviceId,
  onSelectInput,
  onSelectOutput,
  outputSelectionSupported,
  enumerationSupported,
  labelsHidden,
  inputLost,
  t,
}) => (
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
        onChange={(e) => onSelectInput(e.target.value || null)}
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
        onChange={(e) => onSelectOutput(e.target.value || null)}
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
    {!outputSelectionSupported && <p className="ds-device-hint">{t('audioSpeakerUnsupported')}</p>}
    {labelsHidden && <p className="ds-device-hint">{t('audioLabelsHidden')}</p>}
  </div>
);
