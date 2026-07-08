/**
 * Pure derivation of onboarding completion from real account data.
 *
 * Each substep is "done" when its backing resource exists on the account.
 * The portal calls this on every bootstrap/reload and feeds the result into
 * OnboardingStore. Every signal is data-driven — there is no skip-flag
 * shortcut.
 */

import type { Account, OnboardingLocation, OnboardingUser } from '../../types';
import type { DIDItem } from '../../types/phone-numbers';
import type { Device } from '../../types/device';
import type { StepName } from './constants';

export interface OnboardingDataSnapshot {
  account: Account | null;
  users: OnboardingUser[];
  locations: OnboardingLocation[];
  dids: DIDItem[];
  devices: Device[];
}

export interface DerivedOnboardingState {
  completed: Record<StepName, Set<string>>;
}

/**
 * The business-details rule mirrors the form's required fields exactly — any
 * field the user must fill in there must be present for the substep to count
 * as done. Otherwise the portal lies (step shows "Complete" but Review
 * immediately surfaces validation errors).
 */
export function deriveOnboardingState(snapshot: OnboardingDataSnapshot): DerivedOnboardingState {
  const { account, users, locations, dids, devices } = snapshot;

  const completed: Record<StepName, Set<string>> = {
    account: new Set(),
    numbers: new Set(),
    hardware: new Set(),
  };

  const hasBusinessDetails =
    !!account?.name &&
    !!account?.email &&
    !!account?.phone &&
    !!account?.primary_contact_name &&
    !!account?.config?.timezone &&
    locations.some(
      (l) =>
        !!l.name &&
        !!l.address?.street &&
        !!l.address?.city &&
        !!l.address?.state &&
        !!l.address?.postal_code
    );
  if (hasBusinessDetails) completed.account.add('business-details');
  // team-members: ≥1 user who is not the account owner. The owner is the
  // auto-provisioned user carrying the account email, so any user whose email
  // differs (or has no email at all — it can't be the owner) counts; a true
  // empty team can't mark the substep complete.
  const accountEmail = account?.email?.toLowerCase();
  const teamCount = accountEmail
    ? users.filter((u) => u.email?.toLowerCase() !== accountEmail).length
    : users.length;
  if (hasBusinessDetails && teamCount >= 1) completed.account.add('team-members');

  // Any unexpired DID — temp or user-ordered — counts as a working number.
  // Temp DIDs drop out once expires_at passes, flipping the account back to
  // incomplete.
  const now = Date.now();
  const liveDIDs = dids.filter((d) => !d.expires_at || new Date(d.expires_at).getTime() > now);
  const hasActiveDID = liveDIDs.some((d) => d.status === 'active');

  // Substep navigation is a separate concern: a temp DID alone shouldn't fast-
  // forward the user past the order/port flow — they still need a real number.
  // Mark the overview/order substeps as done only when the user has actually
  // walked through buy/port (i.e. owns a non-temporary DID).
  const hasUserDID = liveDIDs.some((d) => d.number_class !== 'temporary');
  if (hasUserDID) {
    completed.numbers.add('overview');
    completed.numbers.add('order-search');
    completed.numbers.add('order-results');
    completed.numbers.add('order-confirm');
  }
  if (hasActiveDID && hasUserDID) completed.numbers.add('order-status');
  const didIds = new Set(liveDIDs.map((d) => d.id));
  // primary-did requires both: a location pointing to a real DID AND that
  // location's E911 binding being provisioned. Without an active E911
  // address, the phone numbers can't legally place calls — so onboarding
  // isn't actually done until the location's E911 is provisioned.
  if (
    locations.some(
      (l) => !!l.primary_did_id && didIds.has(l.primary_did_id) && l.e911_status === 'provisioned'
    )
  ) {
    completed.numbers.add('primary-did');
  }
  // Gate on liveDIDs (not raw dids) for parity with the substeps above — an
  // expired DID's caller-id/listing shouldn't mark the substep complete.
  if (liveDIDs.some((d) => !!d.caller_id_name)) completed.numbers.add('caller-id');
  // 'non_registered' is the default — does NOT count as configured.
  // directory-listing is optional for completion, but the substep still
  // surfaces real status in the wizard.
  if (
    liveDIDs.some(
      (d) => !!d.directory_listing_type && d.directory_listing_type !== 'non_registered'
    )
  ) {
    completed.numbers.add('directory-listing');
  }

  // device-assignment requires a real binding from device → user. Two paths
  // count: (a) a deskphone with ≥1 user assignment, or (b) a DECT base with a
  // handset that has ≥1 user assignment. A device existing on the account
  // isn't enough on its own.
  const hasDeskphoneAssignment = devices.some((d) => (d.assignments?.length ?? 0) > 0);
  const hasHandsetAssignment = devices.some((d) =>
    (d.handsets ?? []).some((h) => (h.assignments?.length ?? 0) > 0)
  );
  if (hasDeskphoneAssignment || hasHandsetAssignment) {
    completed.hardware.add('device-assignment');
  }

  return { completed };
}
