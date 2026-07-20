/**
 * Shared core of the softphone provider — the wiring both the web and native
 * providers reuse so it can't drift between them. Platforms wrap this with only
 * their own bits (web: `<style>`/`<audio>`/live-appearance; native: InCallManager).
 *
 * Must stay DOM- and React-Native-free: it's reachable from the
 * `@dialstack/sdk/react/core` barrel that React Native imports.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import {
  useCalls,
  useCallActions,
  useCallDuration,
  useEmergencyBinding,
  useLastError,
  shouldRingIncoming,
  isIncomingRinging,
  formatDisplayNumber,
} from '../softphone-hooks';
import { resolveSoftphonePalette, type SoftphonePalette } from '../../components/softphone-theme';
import { defaultLocale, type Locale } from '../../locales';
import type { AppearanceOptions } from '../../types/appearance';
import type { CountryCode } from 'libphonenumber-js';
import type { Call, CallEndReason, PlatformStorage } from '../../webrtc';
import type {
  UseCallActions,
  UseEmergencyBinding,
  SoftphoneConnectionState,
  UseCallsOptions,
} from '../softphone-hooks';

/** Context fields both platforms expose. Platforms add their own via `extra`. */
export interface SoftphoneContextBase {
  connection: SoftphoneConnectionState;
  calls: Call[];
  activeCall: Call | null;
  incomingCalls: Call[];
  heldCalls: Call[];
  answerCall: (call: Call) => void;
  switchToCall: (call: Call) => void;
  actions: UseCallActions;
  duration: string;
  consultCall: Call | null;
  transferOriginal: Call | null;
  startAttendedTransfer: (destination: string) => Promise<void>;
  completeAttendedTransfer: () => void;
  cancelAttendedTransfer: () => void;
  placeCall: (destination: string) => Promise<void>;
  dial: (destination: string) => void;
  emergency: UseEmergencyBinding;
  emergencyManagedByHost: boolean;
  lastError: { code: string; message: string } | null;
  clearError: () => void;
  t: (key: keyof Locale['softphone']) => string;
  displayNumber: (value: string) => string;
  /** Resolved theme palette — computed on both platforms so mobile themes like web. */
  palette: SoftphonePalette;
}

const SoftphoneContext = createContext<SoftphoneContextBase | null>(null);

export interface SoftphoneCoreProps {
  token: string;
  apiBaseUrl?: string;
  /** Host callback invoked shortly before the token expires; returns a fresh token. */
  onTokenExpiring?: () => Promise<string>;
  iceServers?: UseCallsOptions['iceServers'];
  storage?: PlatformStorage;
  ringback?: UseCallsOptions['ringback'];
  createSignalingSocket?: UseCallsOptions['createSignalingSocket'];
  onAppResume?: UseCallsOptions['onAppResume'];
  emergencyAddressId?: string;
  autoConnect?: boolean;
  appearance?: AppearanceOptions;
  locale?: Locale;
  defaultCountry?: CountryCode;
  onConnectionStateChange?: (event: { state: SoftphoneConnectionState }) => void;
  onIncomingCall?: (event: { from: string; fromName: string | null }) => void;
  onCallStarted?: (event: { direction: 'inbound' | 'outbound'; peer: string }) => void;
  onCallEnded?: (event: { reason: CallEndReason }) => void;
  onError?: (event: { code: string; message: string }) => void;
}

/** State passed to a platform's effect hook (web audio bind / native InCallManager). */
export interface PlatformEffectState {
  callEntries: ReturnType<typeof useCalls>['calls'];
  activeCall: Call | null;
  incomingCalls: Call[];
  incomingRinging: boolean;
  onError?: (event: { code: string; message: string }) => void;
}

export interface SoftphoneProviderBaseProps<Extra extends object> extends SoftphoneCoreProps {
  /**
   * Platform effects, run as a hook inside the base. Called unconditionally every
   * render, so it MUST be a stable, always-present function — never conditionally
   * `undefined` between renders, or the hooks it contains would change the render's
   * hook count and violate rules-of-hooks. Required for this reason; pass a no-op
   * hook if a platform has no effects.
   */
  platformEffects: (state: PlatformEffectState) => void;
  /** Platform-only context fields (web: `{ scope }`; native: `{ locationProvider }`). */
  extra: Extra;
  children: React.ReactNode;
}

export function SoftphoneProviderBase<Extra extends object>({
  token,
  apiBaseUrl,
  onTokenExpiring,
  iceServers,
  storage,
  ringback,
  createSignalingSocket,
  onAppResume,
  emergencyAddressId,
  autoConnect = true,
  appearance,
  locale = defaultLocale,
  defaultCountry = 'US',
  onConnectionStateChange,
  onIncomingCall,
  onCallStarted,
  onCallEnded,
  onError,
  platformEffects: usePlatformEffects,
  extra,
  children,
}: SoftphoneProviderBaseProps<Extra>): React.JSX.Element {
  const { lastError, handleError, clearError } = useLastError(onError);
  // Key on appearance CONTENT, not object identity, so a host passing an inline
  // `appearance={{ theme }}` literal (new object each render) doesn't recompute
  // the palette every render (incl. every 1s duration tick during a call).
  const appearanceKey = `${appearance?.theme ?? ''}|${JSON.stringify(appearance?.variables ?? {})}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on appearance content (appearanceKey), not identity
  const palette = useMemo(() => resolveSoftphonePalette(appearance), [appearanceKey]);
  const t = (k: keyof Locale['softphone']) => locale.softphone[k];
  const displayNumber = (v: string) => formatDisplayNumber(v, defaultCountry);

  // network.changed must reach useEmergencyBinding, which is created AFTER
  // useCalls. A ref breaks the cycle: useCalls calls a stable wrapper that
  // forwards to the hook's handler once it exists.
  const onNetworkChangedRef = useRef<() => void>(() => {});

  const {
    connection,
    calls: callEntries,
    activeCall,
    incomingCalls,
    heldCalls,
    answerCall,
    switchToCall,
    placeCall,
    consultCall,
    transferOriginal,
    startAttendedTransfer,
    completeAttendedTransfer,
    cancelAttendedTransfer,
    listEmergencyAddresses,
    setEmergencyAddress,
    selectEmergencyAddress,
    getPresentedEmergencyAddressId,
    clearEmergencyAddressRegisteredIp,
    reconnect,
  } = useCalls({
    token,
    apiBaseUrl,
    onTokenExpiring,
    iceServers,
    storage,
    ringback,
    createSignalingSocket,
    onAppResume,
    emergencyAddressId,
    autoConnect,
    onIncomingCall,
    onCallStarted,
    onCallEnded,
    onError: handleError,
    onNetworkChanged: () => onNetworkChangedRef.current(),
  });

  // E911 binding wired once here so web and native can't drift.
  const emergency = useEmergencyBinding({
    disabled: !!emergencyAddressId,
    connection,
    identityKey: token,
    list: listEmergencyAddresses,
    save: setEmergencyAddress,
    select: selectEmergencyAddress,
    getPresentedAddressId: getPresentedEmergencyAddressId,
    clearRegisteredIp: clearEmergencyAddressRegisteredIp,
    reconnect,
  });
  useEffect(() => {
    onNetworkChangedRef.current = emergency.onNetworkChanged;
  }, [emergency.onNetworkChanged]);

  const actions = useCallActions(activeCall, { onError: handleError });
  const duration = useCallDuration(activeCall);

  const calls = useMemo(() => callEntries.map((e) => e.call), [callEntries]);
  const incomingRinging = shouldRingIncoming(incomingCalls);

  // Clear a stale error banner only on the error→connected edge, not every render.
  const prevConnectionRef = useRef(connection);
  useEffect(() => {
    onConnectionStateChange?.({ state: connection });
    if (connection === 'connected' && prevConnectionRef.current !== 'connected') {
      clearError();
    }
    prevConnectionRef.current = connection;
  }, [connection, onConnectionStateChange, clearError]);

  // `use`-cased binding so rules-of-hooks lints the hooks inside the platform
  // effects fn (it's always called, unconditionally, keeping hook order stable).
  usePlatformEffects({ callEntries, activeCall, incomingCalls, incomingRinging, onError });

  const value = useMemo(
    () => ({
      connection,
      calls,
      activeCall,
      incomingCalls,
      heldCalls,
      answerCall,
      switchToCall,
      actions,
      duration,
      consultCall,
      transferOriginal,
      startAttendedTransfer,
      completeAttendedTransfer,
      cancelAttendedTransfer,
      placeCall,
      dial: (destination: string) => {
        const target = destination.trim();
        if (target) void placeCall(target);
      },
      emergency,
      emergencyManagedByHost: !!emergencyAddressId,
      lastError,
      clearError,
      t,
      displayNumber,
      palette,
      ...extra,
    }),
    // t/displayNumber recompute from locale/defaultCountry each render; the
    // meaningful identity drivers are the state + stable callbacks + extra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      connection,
      calls,
      activeCall,
      incomingCalls,
      heldCalls,
      answerCall,
      switchToCall,
      actions,
      duration,
      consultCall,
      transferOriginal,
      startAttendedTransfer,
      completeAttendedTransfer,
      cancelAttendedTransfer,
      placeCall,
      emergency,
      emergencyAddressId,
      lastError,
      clearError,
      palette,
      locale,
      defaultCountry,
      extra,
    ]
  );

  return (
    <SoftphoneContext.Provider value={value as unknown as SoftphoneContextBase}>
      {children}
    </SoftphoneContext.Provider>
  );
}

/** Access the shared context, typed as each platform's own value. Throws outside a provider. */
export function useSoftphoneBase<T extends SoftphoneContextBase>(): T {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) {
    throw new Error(
      'Could not find softphone context; wrap your softphone UI in a <SoftphoneProvider>.'
    );
  }
  return ctx as T;
}

/** Shared accessor: the currently-ringing inbound call, or null. */
export function selectIncomingCall(incomingCalls: Call[]): Call | null {
  return incomingCalls.find(isIncomingRinging) ?? null;
}

export { SoftphoneContext };
