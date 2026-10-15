import type { Meta, StoryObj } from '@storybook/react';
import React, { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { DialPadView } from '../views/DialPadView';
import { EmergencyBannerView } from '../views/EmergencyBannerView';
import { IncomingCallCardView } from '../views/IncomingCallCardView';
import { OngoingCallView } from '../views/OngoingCallView';
import { HOST_SIZES, SoftphoneFrame, type HostSize } from './SoftphoneFrame';
import { Chip, makeStyles } from '../primitives';
import { useRoomyHost } from '../views/useRoomyHost';
import { darkPalette, lightPalette, noop, t } from './fixtures';

const ErrorChip: React.FC<{ palette: Palette }> = ({ palette }) => {
  const { roomy } = useRoomyHost();
  const styles = useMemo(() => makeStyles(palette, !roomy), [palette, roomy]);
  return <Chip styles={styles} tone="error" label={t('callError')} onDismiss={noop} />;
};

const meta: Meta = { title: 'Native/Softphone/Views' };
export default meta;
type Story = StoryObj;

type Palette = typeof lightPalette;

// A generated portrait (inline, so the stories need no network): an image avatar
// as `resolvePeer` can return one.
const PHOTO = {
  uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAEpUlEQVR42u1dS08TURQ+0/Aor0bUIH9KSYyJWnmJIIKl+APQhMIvIMhSBRKQBIk8CoSFcaGJC5eyc+cGC20JFGjBWBeDSKQ8pszcc+be78ssuhjunfm+ufOdc+/hjpX7+ooAPpRQHiSwCgD+eREABdwjAEOA2QPIAgvwAERBAEYAoiCAZwTAhOEB8AAAHoBMGEAmDA8AEAVhBACIgpAJC8bd7sGzT5ga6fPR7Vjpz2M+IP3pYHF/OPVSuhhWSrAA94rl/STeSlVCqAAuUi9cBiv5SZYA9yODXncxOdwnSoBxMdQPqOxucvi5iDA0TyThUMy+rbeEGw9IoD+snH0b4cgA+73zj4BwzwDjGyDcM8A9AljxgJV9CdcQyJPFdUhg/0gDLhLYPKCxJyYq/G3siRnkAY1RWewfahCNGecBQCCfJ8VHk8jH30ZTNKaYDawJF5gd0DkTbu7tF05/c2+/SkKwJlwIeawJm8K/2iio9Vm/LwRQeZ2ojj5tEFioCzLiNQQPYLYBZMLcScePDxMsHZfSvjQuDqiMUB1tTg7M6QFllBNIfynl9qncjOpoCzkYoiAR/CMKIlRHG5kAc3pAMJAVK0DQymZ/BxWHoXJxp/uF/WN6JMbVgoaliU65++83edyCAaWJDrkrToPiW1DLBkyY2YcRhppXlnIRnPRMpy5adAuK2ZA7Ao7zVVwMc/kWVEzKfF+ZUtxldcme5HdC5lcFpqMNmpTGdjUFPEDzKGj7oFIs++qvDdPRzNPRKEvhX5CBCXNORyMTJhM37dvMVV0p35HGxWauChs2YcsyVUjnqmolDYI0x+OPTJi/VIZhNtTRtKiNmaGJmSFnJZROz+cigdMDUtlqT9u/uAZeX8lZ4251cZp35F8LZhyxeTsadutMG0k+9onIWo1zC1CRKeKJLkjuuScUFmCPVYBv8Xfs9ne9Ytvdt8rF2d/Yq2G2fgkCONLgDCUuzrsQ9n28HuCUawlT/6Iz4fXdGu17lL4ekNitqavcVtYXPuBQkJdQXeWWgl7wCZNT8XMnREQ3qra8a5ywfT0LUwLZF70mvLYTqndvHKyJZF/6mvBaJkRE9dVbl2+E8C9KZMwyL1bECCtiRpf6oC7ITwpgBCATJmP3RTCjOlr4DSIKggcgChKIptnNo98fmy/X1Pt/TY03XEEmfA6aZ9Ne6zrWUCsqCjKC+pMdCZFBhAe0qKL+pAyj3DIwe0DLXFqC9qO32GSwvszMcvXdys3+cbxh0iBAZLEcotj/+zQw8MCQCT+cT8kMyVvnUkT0+uZVnTNhsexzXaHSHbPks3+kgYY7ZrX5hH0bbfMpZR9yU/HBvrYFP7F/qMFCSsmnDL3Ho4WkTyfyFFy55x7gX/aPNMBnrEjjGW1vR0B7PKkB/+3xpKcf8/Qqx+vQgn0bHfGkPpkw1pZVZMKPFzc0E8CjO8KOWcxm7Ekm3Knd42+jc3EDe0frVmvtvgc8WVrXWADX7w4ewOwELntAl9aPv42upXV3PQDgHATYMYt4K67d3DGrezlhCP3dywn9vx9AqI4GFNgA1gOYFXBtTTiykjCK/8hKwjdrwgA8QO5L6A97y24lhCPQRwAAAABJRU5ErkJggg==',
  initials: 'MR',
};

// Named peers carry an avatar, as a host's `resolvePeer` gives them, so every
// state shows it wherever it fits; a bare number is the unresolved fallback.
const PEER = {
  id: 'c1',
  name: 'Alice Kowalski',
  number: '(415) 555-0134',
  avatar: { initials: 'AK' },
};

const SAVED_ADDRESS = {
  id: 'ea_1',
  address: {
    address_number: '500',
    street: 'Terry A Francois Blvd',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94158',
    country: 'US',
  },
  registered_ip: null,
  created_at: '2026-01-01T00:00:00Z',
};

const pad = (palette: Palette, over: Partial<React.ComponentProps<typeof DialPadView>> = {}) => (
  <DialPadView
    palette={palette}
    t={t}
    connection="connected"
    destination=""
    onDestinationChange={noop}
    canCall={false}
    onCall={noop}
    {...over}
  />
);

const emergency = (
  palette: Palette,
  over: Partial<React.ComponentProps<typeof EmergencyBannerView>> = {}
) => (
  <EmergencyBannerView
    palette={palette}
    t={t}
    savedAddresses={[SAVED_ADDRESS]}
    submitting={false}
    error={null}
    onConfirm={async () => {}}
    onCreate={async () => {}}
    {...over}
  />
);

const incoming = (
  palette: Palette,
  over: Partial<React.ComponentProps<typeof IncomingCallCardView>> = {}
) => (
  <IncomingCallCardView
    palette={palette}
    t={t}
    name={PEER.name}
    number={PEER.number}
    avatar={PEER.avatar}
    onAnswer={noop}
    onDecline={noop}
    {...over}
  />
);

const call = (
  palette: Palette,
  over: Partial<React.ComponentProps<typeof OngoingCallView>> = {}
) => (
  <OngoingCallView
    palette={palette}
    t={t}
    peer={PEER}
    stateLabel="In call"
    duration="2:17"
    showDuration
    isActive
    isMuted={false}
    isHeld={false}
    transferOther={null}
    canCompleteTransfer={false}
    onSwitchToTransferOther={noop}
    onCancelTransfer={noop}
    onCompleteTransfer={noop}
    switchableHeld={[]}
    onSwitchToCall={noop}
    overlay={null}
    canSendDtmf
    onSendDtmf={noop}
    dtmfEntered=""
    transferTo=""
    onTransferToChange={noop}
    onBlindTransfer={noop}
    onConsultTransfer={noop}
    addCallTo=""
    onAddCallToChange={noop}
    onSubmitAddCall={noop}
    canStartTransfer
    canAddCall
    onToggleMute={noop}
    onToggleHold={noop}
    speakerOn={false}
    canToggleSpeaker
    onToggleSpeaker={noop}
    onToggleOverlay={noop}
    onHangup={noop}
    {...over}
  />
);

const Grid: React.FC<{ palette: Palette; size?: HostSize }> = ({ palette, size }) => (
  <ScrollView
    contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, padding: 20 }}
  >
    <SoftphoneFrame label="dial · no e911 banner" palette={palette} size={size}>
      {pad(palette)}
    </SoftphoneFrame>
    <SoftphoneFrame label="dial · e911 banner" palette={palette} size={size}>
      {emergency(palette)}
      {pad(palette, { compact: true })}
    </SoftphoneFrame>

    <SoftphoneFrame label="dial · error chip" palette={palette} size={size}>
      {pad(palette, { errorChip: <ErrorChip palette={palette} /> })}
    </SoftphoneFrame>
    <SoftphoneFrame label="dial · e911 + error chip" palette={palette} size={size}>
      {emergency(palette)}
      {pad(palette, { compact: true, errorChip: <ErrorChip palette={palette} /> })}
    </SoftphoneFrame>
    <SoftphoneFrame label="in call · error chip" palette={palette} size={size}>
      {call(palette, { errorChip: <ErrorChip palette={palette} /> })}
    </SoftphoneFrame>

    <SoftphoneFrame label="dial · idle" palette={palette} size={size}>
      {pad(palette)}
    </SoftphoneFrame>
    <SoftphoneFrame label="dial · typed" palette={palette} size={size}>
      {pad(palette, { destination: '1002', canCall: true })}
    </SoftphoneFrame>
    <SoftphoneFrame label="dial · connecting" palette={palette} size={size}>
      {pad(palette, { connection: 'connecting' })}
    </SoftphoneFrame>
    <SoftphoneFrame label="dial · reconnecting" palette={palette} size={size}>
      {pad(palette, { connection: 'reconnecting' })}
    </SoftphoneFrame>
    <SoftphoneFrame label="dial · disconnected" palette={palette} size={size}>
      {pad(palette, { connection: 'disconnected' })}
    </SoftphoneFrame>

    <SoftphoneFrame label="incoming · named" palette={palette} size={size}>
      {incoming(palette)}
    </SoftphoneFrame>
    <SoftphoneFrame label="incoming · number only" palette={palette} size={size}>
      {incoming(palette, { name: PEER.number, number: null, avatar: undefined })}
    </SoftphoneFrame>
    <SoftphoneFrame label="incoming · photo avatar" palette={palette} size={size}>
      {incoming(palette, { name: 'Maya Rivera', avatar: PHOTO })}
    </SoftphoneFrame>
    <SoftphoneFrame label="incoming · long name" palette={palette} size={size}>
      {incoming(palette, {
        name: 'Bartholomew Featherstonehaugh-Cholmondeley',
        avatar: { initials: 'BF' },
      })}
    </SoftphoneFrame>
    <SoftphoneFrame label="incoming · compact" palette={palette} size={size}>
      {incoming(palette, { compact: true })}
    </SoftphoneFrame>

    <SoftphoneFrame label="outgoing · ringing" palette={palette} size={size}>
      {call(palette, { isActive: false, showDuration: false, stateLabel: 'Ringing…' })}
    </SoftphoneFrame>
    <SoftphoneFrame label="in call" palette={palette} size={size}>
      {call(palette)}
    </SoftphoneFrame>
    <SoftphoneFrame label="in call · photo avatar" palette={palette} size={size}>
      {call(palette, { peer: { ...PEER, name: 'Maya Rivera', avatar: PHOTO } })}
    </SoftphoneFrame>
    <SoftphoneFrame label="in call · muted" palette={palette} size={size}>
      {call(palette, { isMuted: true })}
    </SoftphoneFrame>
    <SoftphoneFrame label="in call · speaker" palette={palette} size={size}>
      {call(palette, { speakerOn: true })}
    </SoftphoneFrame>
    <SoftphoneFrame label="in call · no audio routing" palette={palette} size={size}>
      {call(palette, { canToggleSpeaker: false })}
    </SoftphoneFrame>
    <SoftphoneFrame label="in call · held" palette={palette} size={size}>
      {call(palette, { isHeld: true, showDuration: false, stateLabel: 'On hold' })}
    </SoftphoneFrame>
    <SoftphoneFrame label="in call · no dtmf" palette={palette} size={size}>
      {call(palette, { canSendDtmf: false })}
    </SoftphoneFrame>

    <SoftphoneFrame label="overlay · keypad" palette={palette} size={size}>
      {call(palette, { overlay: 'keypad' })}
    </SoftphoneFrame>
    <SoftphoneFrame label="overlay · transfer" palette={palette} size={size}>
      {call(palette, { overlay: 'transfer', transferTo: '1002' })}
    </SoftphoneFrame>
    <SoftphoneFrame label="overlay · add call" palette={palette} size={size}>
      {call(palette, { overlay: 'addcall', addCallTo: '1002' })}
    </SoftphoneFrame>

    <SoftphoneFrame label="attended transfer" palette={palette} size={size}>
      {call(palette, {
        transferOther: { id: 'c2', name: 'Bob Chen', number: null, avatar: { initials: 'BC' } },
        canCompleteTransfer: true,
      })}
    </SoftphoneFrame>
    <SoftphoneFrame label="two held calls" palette={palette} size={size}>
      {call(palette, {
        switchableHeld: [
          { id: 'c2', name: 'Bob Chen', number: null, avatar: { initials: 'BC' } },
          { id: 'c3', name: '(415) 555-0199', number: null },
        ],
      })}
    </SoftphoneFrame>
  </ScrollView>
);

export const AllStates: Story = { render: () => <Grid palette={lightPalette} /> };

export const AllStatesDark: Story = { render: () => <Grid palette={darkPalette} /> };

export const EmergencyForm: Story = {
  render: () => (
    <SoftphoneFrame label="dial · e911 open" palette={lightPalette}>
      {emergency(lightPalette, { defaultOpen: true })}
      {pad(lightPalette)}
    </SoftphoneFrame>
  ),
};

export const TallHost: Story = {
  render: () => <Grid palette={lightPalette} size={HOST_SIZES.tall} />,
};

export const ShortHost: Story = {
  render: () => <Grid palette={lightPalette} size={HOST_SIZES.short} />,
};

export const NarrowHost: Story = {
  render: () => <Grid palette={lightPalette} size={HOST_SIZES.narrow} />,
};

export const WideHost: Story = {
  render: () => <Grid palette={lightPalette} size={HOST_SIZES.wide} />,
};

export const SmallHost: Story = {
  render: () => <Grid palette={lightPalette} size={HOST_SIZES.small} />,
};
