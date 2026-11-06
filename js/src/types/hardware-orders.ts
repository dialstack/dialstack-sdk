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

// NEXT MAJOR: remove HardwareOrderLine.unit_price_cents and amount_cents; the
// sell_ fields replace them.
export interface HardwareOrderLine {
  id: string;
  hardware_catalog_id: string;
  quantity: number;
  /** @deprecated Read `sell_unit_price_cents`. Removed in the next major. */
  unit_price_cents: number | null;
  /** @deprecated Read `sell_amount_cents`. Removed in the next major. */
  amount_cents: number | null;
  /**
   * What the account pays per unit, in USD cents. `null` while the line is not
   * yet priced; absent when the platform does not show the account its prices.
   */
  sell_unit_price_cents?: number | null;
  /** `quantity * sell_unit_price_cents`; null or absent exactly when it is. */
  sell_amount_cents?: number | null;
}

/** Where an order ships. */
export interface HardwareOrderAddress {
  /** Set when the caller split the house number off `street`. */
  address_number?: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  postal_code: string;
  country?: string;
}

export interface HardwareOrder {
  id: string;
  object?: string;
  payment_status: string;
  fulfillment_status: string;
  placed_at: string | null;
  /** When the distributor first reported a tracking number; null until then. */
  shipped_at: string | null;
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
  /** Why the order was cancelled; null unless `fulfillment_status` is `cancelled`. */
  cancel_reason: string | null;
  cancelled_at: string | null;
  ship_to_recipient: string | null;
  ship_to_address: HardwareOrderAddress | null;
  /** The carrier service chosen from a shipping quote; cleared by any cart or destination change. */
  shipping_method: string | null;
  lines: HardwareOrderLine[];
  created_at: string;
  updated_at: string;
}

export interface HardwareOrderList {
  object?: 'list';
  data: HardwareOrder[];
}

/** One line of a cart: a catalog item and how many. */
export interface HardwareOrderLineInput {
  hardware_catalog: string;
  quantity: number;
}

export interface CreateHardwareOrderRequest {
  items: HardwareOrderLineInput[];
}

/**
 * Changes to a draft. Omitted fields stay as they are. `items` replaces the
 * cart; any cart or destination change clears the chosen shipping, so a new
 * quote is needed before choosing again.
 */
export interface UpdateHardwareOrderRequest {
  items?: HardwareOrderLineInput[];
  ship_to_recipient?: string;
  ship_to_address?: HardwareOrderAddress;
  /** The quote `shipping_method` was chosen from. */
  shipping_quote?: string;
  shipping_method?: string;
}

export interface HardwareShippingOption {
  carrier: string;
  shipping_method: string;
  /** Null when the platform does not show prices. */
  amount_cents: number | null;
  description?: string;
  estimated_delivery?: string;
}

export interface HardwareShippingQuote {
  id: string;
  object: 'shipping_quote';
  hardware_order: string;
  options: HardwareShippingOption[];
  /** The cart the quote was priced for; it cannot be chosen from once the order differs. */
  items: HardwareOrderLineInput[];
  backordered_lines: { hardware_catalog: string; backordered_qty: number }[];
  ship_to_address: HardwareOrderAddress;
  expires_at: string;
  created_at: string;
}

export interface HardwareCatalogComponent {
  /** The component's own catalog item, to order it on its own; null when it has none. */
  hardware_catalog: string | null;
  manufacturer: string;
  model: string;
  device_type: 'deskphone' | 'dect_base' | 'dect_handset' | 'accessory';
  quantity: number;
}

export interface HardwareCatalogItem {
  id: string;
  manufacturer: string;
  model: string;
  sku?: string | null;
  device_type: 'deskphone' | 'dect_base' | 'dect_handset' | 'accessory' | 'bundle';
  active: boolean;
  /** What a bundle contains. Present only for a bundle. */
  components?: HardwareCatalogComponent[];
}

export interface HardwareCatalogList {
  object?: 'list';
  data: HardwareCatalogItem[];
}
