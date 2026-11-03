import type { PeerInfo, ResolvePeer } from '@dialstack/sdk-react/softphone';

// A stand-in for your own records (a CRM, a patient list), keyed by E.164
// number. Swap in a number you can call or be called from to see the name on
// the call screen.
const sampleContacts: Record<string, PeerInfo> = {
  '+14155550123': { name: 'Jordan Lee', avatar: { initials: 'JL' } },
};

// Runs for every call, in either direction, and its name wins over the
// caller-id and directory names. Unknown numbers return null and keep those.
export const resolvePeer: ResolvePeer = (call) =>
  sampleContacts[call.direction === 'inbound' ? call.from : call.to] ?? null;
