/**
 * In-call microphone/speaker picker. Native `<select>`s rather than the SDK's
 * dial-plan-local `cmdk` combobox, which would need a whole popover style block; a
 * `<select>` also brings keyboard nav and screen-reader support for free.
 */

import React from 'react';
import { useAudioDevices } from '../provider/AudioDevicesProvider';
import { useSoftphone } from '../provider/SoftphoneProvider';
import { AudioDevicePickerView } from './views/AudioDevicePickerView';

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
    <AudioDevicePickerView
      inputs={inputs}
      outputs={outputs}
      inputDeviceId={inputDeviceId}
      outputDeviceId={outputDeviceId}
      onSelectInput={selectInputDevice}
      onSelectOutput={selectOutputDevice}
      outputSelectionSupported={outputSelectionSupported}
      enumerationSupported={enumerationSupported}
      labelsHidden={labelsHidden}
      inputLost={inputLost}
      t={t}
    />
  );
};
