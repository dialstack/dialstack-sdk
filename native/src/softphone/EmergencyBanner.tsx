/**
 * EmergencyBanner (RN) — the built-in "set your emergency location" (E911)
 * prompt shown above the dial pad while the session's emergency address is
 * unbound. A compact banner opens a mobile Modal form (the web's cramped inline
 * two-column layout is unusable on a phone under the keyboard).
 *
 * Hidden when the host manages E911, while binding is loading, or once bound.
 * Reads the E911 flow from the softphone context; owns only its modal/form state.
 *
 * If the host passed a `locationProvider`, the form offers "Use my current
 * location" to prefill the address (the host owns the permission + geolocation +
 * reverse-geocode; the SDK takes no geolocation dependency).
 */
import React from 'react';
import { useSoftphone } from '../SoftphoneProvider';
import { EmergencyBannerView } from './views/EmergencyBannerView';

export function EmergencyBanner(): React.JSX.Element | null {
  const { emergency, emergencyManagedByHost, activeCall, locationProvider, t, palette } =
    useSoftphone();

  if (emergencyManagedByHost || emergency.loading || emergency.bound || activeCall) return null;

  return (
    <EmergencyBannerView
      palette={palette}
      t={t}
      savedAddresses={emergency.savedAddresses}
      submitting={emergency.submitting}
      error={emergency.error}
      onConfirm={emergency.confirm}
      onCreate={emergency.create}
      locationProvider={locationProvider}
    />
  );
}
