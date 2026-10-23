import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { defaultLocale } from '@dialstack/sdk-js';
import { buildSoftphoneStyles } from '../softphone/core/styles';
import { resolveSoftphonePalette, softphoneDimensions } from '../softphone/core/theme';
import { formatDisplayNumber } from '../softphone/core/view-model';
import { DialPadView } from '../softphone/ui/views/DialPadView';
import { EmergencyBannerView } from '../softphone/ui/views/EmergencyBannerView';
import { IncomingCallCardView } from '../softphone/ui/views/IncomingCallCardView';
import { OngoingCallView } from '../softphone/ui/views/OngoingCallView';
import { DEFAULT_SCOPE, type OverlayPanel } from '../softphone/ui/views/types';

const t = ((key: keyof typeof defaultLocale.softphone) =>
  defaultLocale.softphone[key]) as React.ComponentProps<typeof DialPadView>['t'];
const displayNumber = (value: string): string => formatDisplayNumber(value);
const noop = (): void => {};

interface Size {
  w: number;
  h: number;
}

const BASELINE: Size = { w: 320, h: softphoneDimensions.defaultHeight };

const AUTO: Size = { w: 320, h: 'auto' as unknown as number };

const SizeContext = React.createContext<Size>(BASELINE);

const Cell: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const { w, h } = React.useContext(SizeContext);
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <figcaption style={{ font: '600 11px system-ui', letterSpacing: '0.04em', opacity: 0.6 }}>
        {label.toUpperCase()}
      </figcaption>
      <div
        style={{
          width: w,
          height: h,
          overflow: 'auto',
          outline: '1px solid rgba(128,128,128,.35)',
          background:
            'repeating-linear-gradient(45deg, rgba(128,128,128,.10) 0 6px, rgba(128,128,128,.04) 6px 12px)',
        }}
      >
        {children}
      </div>
    </figure>
  );
};

const Grid: React.FC<{
  theme: 'light' | 'dark';
  size?: Size;
  height?: string;
  children: React.ReactNode;
}> = ({ theme, size = BASELINE, height, children }) => (
  <>
    <style>{buildSoftphoneStyles(resolveSoftphonePalette({ theme }))}</style>
    <SizeContext.Provider value={height ? { ...size, h: height as unknown as number } : size}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 28,
          padding: 20,
          background: theme === 'dark' ? '#111' : '#f6f6fa',
          color: theme === 'dark' ? '#eee' : '#111',
        }}
      >
        {children}
      </div>
    </SizeContext.Provider>
  </>
);

const dial = (over: Partial<React.ComponentProps<typeof DialPadView>> = {}) => (
  <DialPadView
    connection="connected"
    destination=""
    onDestinationChange={noop}
    onDestinationPaste={noop}
    canCall={false}
    onCall={noop}
    t={t}
    {...over}
  />
);

const incoming = (over: Partial<React.ComponentProps<typeof IncomingCallCardView>> = {}) => (
  <div className="ds-softphone">
    <div className="ds-screen ds-screen-incoming">
      <IncomingCallCardView
        name="Alice Kowalski"
        avatar={{ initials: 'AK' }}
        number={displayNumber('+14155550134')}
        onAnswer={noop}
        onDecline={noop}
        t={t}
        {...over}
      />
    </div>
  </div>
);

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
  number: displayNumber('+14155550134'),
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
  },
  registered_ip: null,
  created_at: '2026-01-01T00:00:00Z',
};

const emergency = (over: Partial<React.ComponentProps<typeof EmergencyBannerView>> = {}) => (
  <EmergencyBannerView
    savedAddresses={[SAVED_ADDRESS]}
    submitting={false}
    error={null}
    onConfirm={async () => {}}
    onCreate={async () => {}}
    t={t}
    {...over}
  />
);

const dialScreen = (
  banner: React.ReactNode,
  over: Partial<React.ComponentProps<typeof DialPadView>> = {}
) => (
  <div className={`${DEFAULT_SCOPE} ds-dial-screen`}>
    {banner}
    {dial(over)}
  </div>
);

const ongoing = (over: Partial<React.ComponentProps<typeof OngoingCallView>> = {}) => (
  <OngoingCallView
    peer={PEER}
    stateLabel={defaultLocale.softphone.stateActive}
    duration="2:17"
    showDuration
    isActive
    isMuted={false}
    isHeld={false}
    isMerged={false}
    conferenceParties={[]}
    conferenceLabel={defaultLocale.softphone.conferenceLabel}
    transferOther={null}
    canCompleteTransfer={false}
    onSwitchToTransferOther={noop}
    onCancelTransfer={noop}
    onCompleteTransfer={noop}
    switchableHeld={[]}
    onSwitchToCall={noop}
    overlay={null}
    canSendDtmf
    dtmfEntered=""
    onSendDtmf={noop}
    transferTo=""
    onTransferToChange={noop}
    onTransferToPaste={noop}
    onBlindTransfer={noop}
    onConsultTransfer={noop}
    addCallTo=""
    onAddCallToChange={noop}
    onAddCallToPaste={noop}
    onSubmitAddCall={noop}
    canStartTransfer
    canAddCall
    canMerge={false}
    onToggleMute={noop}
    onToggleHold={noop}
    onToggleOverlay={noop}
    onMergeOrSplit={noop}
    onHangup={noop}
    t={t}
    {...over}
  />
);

const sampleDirectory = [
  { id: 'reception', label: 'Reception', destination: '100' },
  {
    id: 'dana-ortiz',
    label: 'Dana Ortiz',
    destination: '201',
    description: 'Ext. 201',
    group: 'Team',
    tags: ['On call'],
  },
  {
    id: 'lee-park',
    label: 'Lee Park',
    destination: '202',
    description: 'Ext. 202',
    group: 'Team',
    tags: ['Spanish', 'Billing'],
  },
  {
    id: 'after-hours-line',
    label: 'After-hours line',
    destination: '+14155550100',
    group: 'External',
  },
];

const overlayCell = (panel: Exclude<OverlayPanel, null>) =>
  ongoing({
    overlay: panel,
    transferTo: panel === 'transfer' ? '1002' : '',
    addCallTo: panel === 'addcall' ? '1002' : '',
    dtmfEntered: panel === 'keypad' ? '12' : '',
    devicesPanel: panel === 'devices' ? <div className="ds-devices" /> : null,
  });

const AllCells: React.FC = () => (
  <>
    <Cell label="dial · no e911 banner">{dialScreen(null)}</Cell>
    <Cell label="dial · e911 banner">{dialScreen(emergency())}</Cell>
    <Cell label="dial · e911 expanded">{dialScreen(emergency({ defaultExpanded: true }))}</Cell>
    <Cell label="dial · e911 new address">
      {dialScreen(emergency({ defaultExpanded: true, defaultAddingNew: true }))}
    </Cell>

    <Cell label="dial · idle">{dial()}</Cell>
    <Cell label="dial · typed">{dial({ destination: '1002', canCall: true })}</Cell>
    <Cell label="dial · connecting">{dial({ connection: 'connecting' })}</Cell>
    <Cell label="dial · reconnecting">{dial({ connection: 'reconnecting' })}</Cell>
    <Cell label="dial · disconnected">{dial({ connection: 'disconnected' })}</Cell>
    <Cell label="dial · error">
      {dial({ connection: 'error', error: { code: 'mic_denied', message: '' } })}
    </Cell>

    <Cell label="incoming · named">{incoming()}</Cell>
    <Cell label="incoming · number only">
      {incoming({ name: displayNumber('+14155550134'), number: null, avatar: undefined })}
    </Cell>
    <Cell label="incoming · photo avatar">{incoming({ name: 'Maya Rivera', avatar: PHOTO })}</Cell>
    <Cell label="incoming · photo avatar · broken image">
      {incoming({
        name: 'Maya Rivera',
        avatar: { ...PHOTO, uri: 'https://invalid.example/missing.png' },
      })}
    </Cell>
    <Cell label="incoming · long name">
      {incoming({ name: 'Bartholomew Featherstonehaugh-Cholmondeley', avatar: { initials: 'BF' } })}
    </Cell>
    <Cell label="incoming · compact">{incoming({ compact: true })}</Cell>

    <Cell label="outgoing · ringing">
      {ongoing({
        isActive: false,
        showDuration: false,
        duration: '',
        stateLabel: defaultLocale.softphone.stateRinging,
      })}
    </Cell>
    <Cell label="in call">{ongoing()}</Cell>
    <Cell label="in call · photo avatar">
      {ongoing({ peer: { ...PEER, name: 'Maya Rivera', avatar: PHOTO } })}
    </Cell>
    <Cell label="in call · muted">{ongoing({ isMuted: true })}</Cell>
    <Cell label="in call · held">
      {ongoing({
        isHeld: true,
        showDuration: false,
        stateLabel: defaultLocale.softphone.stateHeld,
      })}
    </Cell>
    <Cell label="in call · no dtmf">{ongoing({ canSendDtmf: false })}</Cell>

    <Cell label="overlay · keypad">{overlayCell('keypad')}</Cell>
    <Cell label="overlay · transfer">{overlayCell('transfer')}</Cell>
    <Cell label="overlay · transfer · directory">
      {ongoing({
        overlay: 'transfer',
        transferTo: '201',
        directory: sampleDirectory,
        pickedTransferContact: sampleDirectory[1],
      })}
    </Cell>
    <Cell label="overlay · add call">{overlayCell('addcall')}</Cell>
    <Cell label="overlay · add call · directory">
      {ongoing({ overlay: 'addcall', directory: sampleDirectory })}
    </Cell>
    <Cell label="overlay · devices">{overlayCell('devices')}</Cell>

    <Cell label="conference">
      {ongoing({
        isMerged: true,
        canMerge: true,
        conferenceParties: [
          PEER,
          { id: 'c2', name: 'Bob Chen', number: null, avatar: { initials: 'BC' } },
        ],
      })}
    </Cell>
    <Cell label="attended transfer">
      {ongoing({
        transferOther: { id: 'c2', name: 'Bob Chen', number: null, avatar: { initials: 'BC' } },
        canCompleteTransfer: true,
      })}
    </Cell>
    <Cell label="two held calls">
      {ongoing({
        switchableHeld: [
          { id: 'c2', name: 'Bob Chen', number: null, avatar: { initials: 'BC' } },
          { id: 'c3', name: displayNumber('+14155550199'), number: null },
        ],
      })}
    </Cell>
  </>
);

const meta: Meta = {
  title: 'React/Softphone/Views',
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } },
};
export default meta;
type Story = StoryObj;

export const AllStates: Story = {
  render: () => (
    <Grid theme="light">
      <AllCells />
    </Grid>
  ),
};

export const AllStatesDark: Story = {
  render: () => (
    <Grid theme="dark">
      <AllCells />
    </Grid>
  ),
};

export const WideHost: Story = {
  render: () => (
    <Grid theme="light" size={{ w: 560, h: BASELINE.h }}>
      <AllCells />
    </Grid>
  ),
};

export const NarrowHost: Story = {
  render: () => (
    <Grid theme="light" size={{ w: 260, h: BASELINE.h }}>
      <AllCells />
    </Grid>
  ),
};

export const ShortHost: Story = {
  render: () => (
    <Grid theme="light" size={{ w: 320, h: 420 }}>
      <AllCells />
    </Grid>
  ),
};

export const AutoHeight: Story = {
  render: () => (
    <Grid theme="light" size={AUTO}>
      <AllCells />
    </Grid>
  ),
};

export const FixedHeight: Story = {
  render: () => (
    <Grid theme="light" height={`${softphoneDimensions.defaultHeight}px`}>
      <AllCells />
    </Grid>
  ),
};

export const TallHost: Story = {
  render: () => (
    <Grid theme="light" size={{ w: 320, h: BASELINE.h + 160 }}>
      <AllCells />
    </Grid>
  ),
};

export const SmallHost: Story = {
  render: () => (
    <Grid theme="light" size={{ w: 260, h: 420 }}>
      <AllCells />
    </Grid>
  ),
};
