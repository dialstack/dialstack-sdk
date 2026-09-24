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
}

export const CONTACTS: Contact[] = [
  { id: 'p1', name: 'Avery Thompson', detail: 'Follow-up · lower back', phone: '+12025550101' },
  { id: 'p2', name: 'Jordan Patel', detail: 'New patient intake', phone: '+12025550102' },
  { id: 'p3', name: 'Morgan Lee', detail: 'Reschedule request', phone: '+12025550103' },
  { id: 'p4', name: 'Riley Chen', detail: 'Insurance question', phone: '+12025550104' },
  { id: 'p5', name: 'Casey Nguyen', detail: 'Post-adjustment check-in', phone: '+12025550105' },
  { id: 'p6', name: 'Sam Rivera', detail: 'Billing callback', phone: '+12025550106' },
];
