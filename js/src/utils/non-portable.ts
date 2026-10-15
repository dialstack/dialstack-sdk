import type { NonPortableNumber } from '../types/number-porting';

/** Each surface's own wording for why a number cannot be ported. */
export interface NonPortableMessages {
  unsupportedCarrier: (carrier: string | undefined) => string;
  unsupportedArea: (area: string | undefined) => string;
  unsupportedNumber: string;
  /** A reason this version does not know yet, or none at all. */
  unknown: string;
}

/**
 * Why a number cannot be ported, in the caller's words. Shared so every
 * surface that checks portability explains a refusal the same way.
 */
export function describeNonPortable(np: NonPortableNumber, messages: NonPortableMessages): string {
  switch (np.reason) {
    case 'unsupported_carrier':
      return messages.unsupportedCarrier(np.losing_carrier_name || undefined);
    case 'unsupported_rate_center':
      return messages.unsupportedArea([np.city, np.state].filter(Boolean).join(', ') || undefined);
    case 'unsupported_number':
      return messages.unsupportedNumber;
    default:
      return messages.unknown;
  }
}
