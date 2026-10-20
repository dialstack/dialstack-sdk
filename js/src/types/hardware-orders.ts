/**
 * Hardware orders as an account sees them. Amounts are what the platform
 * charges its customer, or null when the platform does not show prices.
 */

export interface HardwareOrderApproval {
  side: 'customer' | 'platform';
  approved_at: string;
  ip: string | null;
  user_agent: string | null;
  consent_hash: string | null;
}

export interface HardwareOrderLine {
  id: string;
  hardware_catalog_id: string;
  quantity: number;
  unit_price_cents: number | null;
  amount_cents: number | null;
}

export interface HardwareOrder {
  id: string;
  object?: string;
  payment_status: string;
  fulfillment_status: string;
  placed_at: string | null;
  /** When the draft was submitted for approval; null when it is not pending. */
  approval_requested_at: string | null;
  built_by: 'customer' | 'platform' | null;
  /** The order exceeded the platform's threshold, so the platform approves too. */
  requires_platform_approval: boolean;
  approvals: HardwareOrderApproval[];
  goods_cents: number | null;
  shipping_cents: number | null;
  total_cents: number | null;
  rejection_reason: string | null;
  lines: HardwareOrderLine[];
  created_at: string;
  updated_at: string;
}

export interface HardwareOrderList {
  object?: 'list';
  data: HardwareOrder[];
}
