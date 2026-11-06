import { toE164 } from './phone';

/**
 * Fake patients, standing in for whatever records your app already shows. The
 * numbers are in the 555-01xx range reserved for fiction, so tapping one places
 * a call that goes nowhere: swap one for a phone you can answer to hear the
 * whole flow.
 */
export interface Contact {
  id: string;
  name: string;
  detail: string;
  phone: string;
  /** What the app shows about them while on a call with them. */
  dateOfBirth: string;
  email: string;
  patientSince: string;
  nextVisit: string | null;
}

export const CONTACTS: Contact[] = [
  {
    id: 'p1',
    name: 'Avery Thompson',
    detail: 'Follow-up · lower back',
    phone: '+12025550101',
    dateOfBirth: 'Mar 14, 1986',
    email: 'avery.thompson@example.com',
    patientSince: 'Jan 9, 2024',
    nextVisit: 'Nov 12 · Adjustment',
  },
  {
    id: 'p2',
    name: 'Jordan Patel',
    detail: 'New patient intake',
    phone: '+12025550102',
    dateOfBirth: 'Jul 2, 1994',
    email: 'jordan.patel@example.com',
    patientSince: 'Oct 28, 2026',
    nextVisit: 'Nov 6 · Initial consult',
  },
  {
    id: 'p3',
    name: 'Morgan Lee',
    detail: 'Reschedule request',
    phone: '+12025550103',
    dateOfBirth: 'Dec 21, 1978',
    email: 'morgan.lee@example.com',
    patientSince: 'May 3, 2022',
    nextVisit: null,
  },
  {
    id: 'p4',
    name: 'Riley Chen',
    detail: 'Insurance question',
    phone: '+12025550104',
    dateOfBirth: 'Feb 8, 1990',
    email: 'riley.chen@example.com',
    patientSince: 'Aug 17, 2023',
    nextVisit: 'Nov 20 · Follow-up',
  },
  {
    id: 'p5',
    name: 'Casey Nguyen',
    detail: 'Post-adjustment check-in',
    phone: '+12025550105',
    dateOfBirth: 'Sep 30, 1982',
    email: 'casey.nguyen@example.com',
    patientSince: 'Feb 1, 2025',
    nextVisit: 'Nov 9 · Adjustment',
  },
  {
    id: 'p6',
    name: 'Sam Rivera',
    detail: 'Billing callback',
    phone: '+12025550106',
    dateOfBirth: 'Jun 11, 1969',
    email: 'sam.rivera@example.com',
    patientSince: 'Nov 4, 2019',
    nextVisit: null,
  },
];

/** The patient a number belongs to, however it was written. */
export function matchContact(number: string): Contact | null {
  const e164 = toE164(number);
  return e164 ? (CONTACTS.find((c) => c.phone === e164) ?? null) : null;
}
