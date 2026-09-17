import { DialStackPhone, type PhoneOptions } from '@dialstack/sdk-webrtc';

import { nativeSignalingSocket } from '../nativeSignalingSocket';

export type CreatePhoneOptions = Omit<
  PhoneOptions,
  'createSignalingSocket' | 'deferInboundCapture'
>;

let phone: DialStackPhone | null = null;

/**
 * The process's one phone.
 *
 * Module scope is the correct scope, not a shortcut: a push wake and the UI run
 * in the same JS runtime but enter from different places (a headless task, the
 * app window), so this is a plain shared reference. Two phones would register
 * the same SIP AOR twice and the call would go to whichever registered last
 * while the UI watched the other — a silent failure, so a second construction
 * fails loudly instead. Construct eagerly at app entry: `new DialStackPhone()`
 * does no I/O (only `connect()` does).
 */
export function createPhone(options: CreatePhoneOptions): DialStackPhone {
  if (phone) {
    throw new Error(
      'createPhone: a DialStackPhone already exists in this process. One phone per ' +
        'process — one OS call surface, one SIP AOR. Use getPhone() to adopt it.'
    );
  }
  phone = new DialStackPhone({
    ...options,
    createSignalingSocket: nativeSignalingSocket,
    // CallKit and Telecom activate the call's audio session only on answer, and
    // capturing before that costs the call its microphone for good — so the mic is
    // always taken on answer here. Not an option: there is no RN case that wants
    // the other behaviour.
    deferInboundCapture: true,
  });
  return phone;
}

export function getPhone(): DialStackPhone | null {
  return phone;
}

/** For consumers that must not be the one to create it (the UI). */
export function requirePhone(): DialStackPhone {
  if (!phone) {
    throw new Error('requirePhone: no phone yet — createPhone() runs at the app entry.');
  }
  return phone;
}

/** Test-only: the app never has a valid reason to forget its phone. */
export function resetPhoneForTests(): void {
  phone = null;
}
