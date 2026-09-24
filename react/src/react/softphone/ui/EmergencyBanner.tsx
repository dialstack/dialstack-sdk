/**
 * EmergencyBanner — the built-in "set your emergency location" (E911) prompt
 * shown above the dial pad while the session's emergency address is unbound.
 *
 * Shown only on the idle dialer: the user sets a location before dialing (the
 * server is the authority on outbound PSTN). Hidden when the host manages E911
 * (emergencyAddressId supplied), while binding is loading, once bound, or while
 * a call is active. Submitting an address forces a reconnect, so the dial pad
 * disables placing calls (`canPlaceCall` reads `emergency.submitting`) until it
 * settles — otherwise a call started mid-reconnect would be dropped.
 *
 * Reads the E911 flow (`emergency`) from the softphone context; owns only its own
 * expand/form UI state.
 */

import React from 'react';
import { useSoftphone } from '../provider/SoftphoneProvider';
import { EmergencyBannerView } from './views/EmergencyBannerView';

export const EmergencyBanner: React.FC = () => {
  const { emergency, emergencyManagedByHost, activeCall, t, scope } = useSoftphone();

  // Only prompt on the idle dialer — never over an active call (the prompt is
  // for setting up outbound PSTN before dialing, not mid-conversation).
  if (emergencyManagedByHost || emergency.loading || emergency.bound || activeCall) return null;

  return (
    <EmergencyBannerView
      savedAddresses={emergency.savedAddresses}
      submitting={emergency.submitting}
      error={emergency.error}
      onConfirm={emergency.confirm}
      onCreate={emergency.create}
      scope={scope}
      t={t}
    />
  );
};
