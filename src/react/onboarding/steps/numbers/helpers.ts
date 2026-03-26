import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { PhoneNumberStatus } from '../../../../types';
import type { NumSubStep } from '../../constants';

export function formatPhone(phone: string): string {
  return parsePhoneNumberFromString(phone, 'US')?.formatNational() ?? phone;
}

export function getStatusBadgeClass(status: PhoneNumberStatus): string {
  if (status === 'active') return 'num-status-active';
  if (status === 'ordering') return 'num-status-ordering';
  if (status === 'order_failed' || status === 'porting_exception') return 'num-status-error';
  if (status === 'inactive' || status === 'released') return 'num-status-inactive';
  return 'num-status-porting';
}

export function getSidebarActiveKey(subStep: NumSubStep): string {
  if (subStep === 'overview') return 'options';
  if (subStep === 'primary-did') return 'primary-did';
  if (subStep === 'caller-id') return 'caller-id';
  if (subStep === 'directory-listing') return 'directory-listing';
  if (subStep === 'order-status' || subStep === 'port-submitted') return 'verification';
  return 'setup';
}

export function validateCallerIdName(
  name: string,
  tooLong: string,
  invalidChars: string
): string | null {
  if (!name.trim()) return null;
  if (name.length > 15) return tooLong;
  if (!/^[A-Za-z0-9 -]+$/.test(name)) return invalidChars;
  return null;
}
