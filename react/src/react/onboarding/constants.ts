// ── Step names ──────────────────────────────────────────────────────────
export const ONBOARDING_STEPS = ['account', 'numbers', 'hardware'] as const;
export type StepName = (typeof ONBOARDING_STEPS)[number];

// ── Account substeps ────────────────────────────────────────────────────
export const ACCOUNT_SUBSTEPS = ['business-details', 'team-members'] as const;
export type AccountSubStep = (typeof ACCOUNT_SUBSTEPS)[number];

// ── Numbers substeps ────────────────────────────────────────────────────
export const NUMBERS_SUBSTEPS = [
  'overview',
  'order-search',
  'order-results',
  'order-confirm',
  'order-status',
  'port-numbers',
  'port-eligibility',
  'port-carrier-select',
  'port-subscriber',
  'port-foc-date',
  'port-documents',
  'port-review',
  'port-submitted',
  'e911',
  'caller-id',
  'directory-listing',
] as const;
export type NumSubStep = (typeof NUMBERS_SUBSTEPS)[number];

// ── Hardware substeps ───────────────────────────────────────────────────
export const HARDWARE_SUBSTEPS = ['device-assignment'] as const;
export type HardwareSubStep = (typeof HARDWARE_SUBSTEPS)[number];

// ── Sidebar groups ──────────────────────────────────────────────────────
export interface SidebarGroup {
  sidebarKey: string;
  substeps: string[];
  /** When true, this group is shown in the sidebar but does not gate
   *  step-level completion. Use for legally-optional substeps that should
   *  still be discoverable. */
  optional?: boolean;
}

export const SIDEBAR_GROUPS: Record<StepName, SidebarGroup[]> = {
  account: [
    { sidebarKey: 'business-details', substeps: ['business-details'] },
    { sidebarKey: 'team-members', substeps: ['team-members'] },
  ],
  numbers: [
    { sidebarKey: 'options', substeps: ['overview'] },
    {
      sidebarKey: 'setup',
      substeps: [
        'order-search',
        'order-results',
        'order-confirm',
        'port-numbers',
        'port-eligibility',
        'port-carrier-select',
        'port-subscriber',
        'port-foc-date',
        'port-documents',
        'port-review',
      ],
    },
    { sidebarKey: 'verification', substeps: ['order-status', 'port-submitted'] },
    { sidebarKey: 'e911', substeps: ['e911'] },
    { sidebarKey: 'caller-id', substeps: ['caller-id'], optional: true },
    { sidebarKey: 'directory-listing', substeps: ['directory-listing'], optional: true },
  ],
  hardware: [{ sidebarKey: 'device-assignment', substeps: ['device-assignment'] }],
};

/** Flat list of all substeps per step (derived from sidebar groups). */
export const ORDERED_SUBSTEPS: Record<StepName, string[]> = {
  account: SIDEBAR_GROUPS.account.flatMap((g) => g.substeps),
  numbers: SIDEBAR_GROUPS.numbers.flatMap((g) => g.substeps),
  hardware: SIDEBAR_GROUPS.hardware.flatMap((g) => g.substeps),
};
