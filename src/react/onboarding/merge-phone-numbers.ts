/**
 * Merge DIDs, number orders, and port orders into a unified PhoneNumberItem list.
 * Pure function — used by the React onboarding portal and numbers step.
 */

import type {
  DIDItem,
  NumberOrder,
  PortOrder,
  PhoneNumberItem,
  PhoneNumberStatus,
} from '../../types';

export function mergePhoneNumbers(
  dids: DIDItem[],
  orders: NumberOrder[],
  ports: PortOrder[]
): PhoneNumberItem[] {
  const map = new Map<string, PhoneNumberItem>();

  const activePortNumbers = new Set<string>();
  for (const port of ports) {
    if (port.status !== 'complete' && port.status !== 'cancelled') {
      for (const num of port.details.phone_numbers) {
        activePortNumbers.add(num);
      }
    }
  }

  for (const did of dids) {
    if (did.status === 'inactive' && activePortNumbers.has(did.phone_number)) continue;
    map.set(did.phone_number, {
      phone_number: did.phone_number,
      status: did.status as PhoneNumberStatus,
      number_class: did.number_class,
      expires_at: did.expires_at,
      outbound_enabled: did.outbound_enabled,
      caller_id_name: did.caller_id_name,
      routing_target: did.routing_target,
      source: 'did',
      created_at: did.created_at,
      updated_at: did.updated_at,
    });
  }

  for (const order of orders) {
    if (order.status !== 'pending' && order.status !== 'partial') continue;
    for (const num of order.phone_numbers) {
      if (order.completed_numbers.includes(num)) continue;
      if (map.has(num)) continue;
      const isFailed = order.failed_numbers.includes(num);
      map.set(num, {
        phone_number: num,
        status: isFailed ? 'order_failed' : 'ordering',
        outbound_enabled: null,
        source: 'number_order',
        created_at: order.created_at,
        updated_at: order.updated_at,
        order_id: order.id,
      });
    }
  }

  for (const port of ports) {
    if (port.status === 'complete' || port.status === 'cancelled') continue;
    const portStatusMap: Record<string, PhoneNumberStatus> = {
      draft: 'porting_draft',
      approved: 'porting_approved',
      submitted: 'porting_submitted',
      exception: 'porting_exception',
      foc: 'porting_foc',
    };
    const portStatus = portStatusMap[port.status] || 'porting_draft';
    for (const num of port.details.phone_numbers) {
      if (map.has(num)) continue;
      map.set(num, {
        phone_number: num,
        status: portStatus,
        outbound_enabled: null,
        carrier: port.details.losing_carrier?.name,
        transfer_date: port.details.actual_foc_date || port.details.requested_foc_date,
        source: 'port_order',
        created_at: port.created_at,
        updated_at: port.updated_at,
        port_order_id: port.id,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.phone_number.localeCompare(b.phone_number));
}
