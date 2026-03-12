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
  'port-subscriber',
  'port-foc-date',
  'port-documents',
  'port-review',
  'port-submitted',
  'primary-did',
  'caller-id',
] as const;
export type NumSubStep = (typeof NUMBERS_SUBSTEPS)[number];

// ── Hardware substeps ───────────────────────────────────────────────────
export const HARDWARE_SUBSTEPS = ['device-assignment', 'final-completion'] as const;
export type HardwareSubStep = (typeof HARDWARE_SUBSTEPS)[number];

// ── Sidebar groups ──────────────────────────────────────────────────────
export interface SidebarGroup {
  sidebarKey: string;
  substeps: string[];
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
        'port-subscriber',
        'port-foc-date',
        'port-documents',
        'port-review',
      ],
    },
    { sidebarKey: 'verification', substeps: ['order-status', 'port-submitted'] },
    { sidebarKey: 'primary-did', substeps: ['primary-did'] },
    { sidebarKey: 'caller-id', substeps: ['caller-id'] },
  ],
  hardware: [
    { sidebarKey: 'device-assignment', substeps: ['device-assignment'] },
    { sidebarKey: 'final-completion', substeps: ['final-completion'] },
  ],
};

/** Flat list of all substeps per step (derived from sidebar groups). */
export const ORDERED_SUBSTEPS: Record<StepName, string[]> = {
  account: SIDEBAR_GROUPS.account.flatMap((g) => g.substeps),
  numbers: SIDEBAR_GROUPS.numbers.flatMap((g) => g.substeps),
  hardware: SIDEBAR_GROUPS.hardware.flatMap((g) => g.substeps),
};
