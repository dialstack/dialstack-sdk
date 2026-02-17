/**
 * DialStack SDK initialization (pure - no side effects)
 *
 * This module is identical to initialize.ts but does NOT auto-register
 * Web Components. Use this for:
 * - Server-side rendering (SSR)
 * - Testing environments
 * - When you want manual control over component registration
 *
 * Note: You must ensure components are registered before using dialstack.create()
 */

import type { DialStackInstance, DialStackInitParams } from '../types';
import { DialStackInstanceImplClass } from './instance';

// NOTE: Unlike initialize.ts, we do NOT import components here
// Components must be registered separately if needed

/**
 * Load and initialize the DialStack SDK (pure, no side effects)
 *
 * This is the pure version that doesn't auto-register Web Components.
 * Use the regular loadDialstackAndInitialize() from '@dialstack/sdk' if you
 * want automatic component registration.
 *
 * @param initParams - Initialization parameters
 * @returns DialStack SDK instance with create(), update(), and logout() methods
 *
 * @example
 * ```typescript
 * import { loadDialstackAndInitialize } from '@dialstack/sdk/pure';
 *
 * // For SSR/testing - components won't be registered
 * const dialstack = await loadDialstackAndInitialize({
 *   publishableKey: 'pk_test_...',
 *   fetchClientSecret: async () => {
 *     const response = await fetch('/api/dialstack/session');
 *     const data = await response.json();
 *     return data.clientSecret;
 *   }
 * });
 * ```
 */
export async function loadDialstackAndInitialize(
  initParams: DialStackInitParams
): Promise<DialStackInstance> {
  // Validate required parameters
  if (!initParams.publishableKey) {
    throw new Error('DialStack: publishableKey is required');
  }

  if (!initParams.fetchClientSecret) {
    throw new Error('DialStack: fetchClientSecret is required');
  }

  if (typeof initParams.fetchClientSecret !== 'function') {
    throw new Error('DialStack: fetchClientSecret must be a function');
  }

  // Create the instance implementation
  const instance = new DialStackInstanceImplClass(initParams);

  // Eagerly start fetching client secret (parallelize work)
  // Errors are logged in instance and will retry automatically
  instance.startSession().catch((error) => {
    console.error('DialStack: Initial session fetch failed:', error);
  });

  // Return synchronous wrapper that exposes the public API
  // Operations are queued internally until the session is ready
  const wrapper: DialStackInstance = {
    create: (tagName) => {
      return instance.create(tagName);
    },
    update: (updateOptions) => {
      instance.update(updateOptions);
    },
    logout: async () => {
      await instance.logout();
    },
    fetchApi: (path, options) => {
      return instance.fetchApi(path, options);
    },
    initiateCall: (userId, dialString) => {
      return instance.initiateCall(userId, dialString);
    },
    getTranscript: (callId) => {
      return instance.getTranscript(callId);
    },
    getVoicemailTranscript: (userId, voicemailId) => {
      return instance.getVoicemailTranscript(userId, voicemailId);
    },
    on: (event, handler) => {
      instance.on(event, handler);
    },
    off: (event, handler) => {
      instance.off(event, handler);
    },
    listExtensions: (options) => {
      return instance.listExtensions(options);
    },
    getCallerID: (phoneNumberId) => {
      return instance.getCallerID(phoneNumberId);
    },
    // Phone number list methods
    listPhoneNumbers: (options) => {
      return instance.listPhoneNumbers(options);
    },
    listNumberOrders: (options) => {
      return instance.listNumberOrders(options);
    },
    listPortOrders: (options) => {
      return instance.listPortOrders(options);
    },
    // Phone number ordering methods
    searchAvailableNumbers: (options) => {
      return instance.searchAvailableNumbers(options);
    },
    createPhoneNumberOrder: (phoneNumbers) => {
      return instance.createPhoneNumberOrder(phoneNumbers);
    },
    getPhoneNumberOrder: (orderId) => {
      return instance.getPhoneNumberOrder(orderId);
    },
    // Device methods
    createDevice: (data) => {
      return instance.createDevice(data);
    },
    getDevice: (id) => {
      return instance.getDevice(id);
    },
    listDevices: (options) => {
      return instance.listDevices(options);
    },
    updateDevice: (id, data) => {
      return instance.updateDevice(id, data);
    },
    deleteDevice: (id) => {
      return instance.deleteDevice(id);
    },
    listProvisioningEvents: (deviceId, options) => {
      return instance.listProvisioningEvents(deviceId, options);
    },
    // Number porting methods
    checkPortEligibility: (phoneNumbers) => {
      return instance.checkPortEligibility(phoneNumbers);
    },
    createPortOrder: (request) => {
      return instance.createPortOrder(request);
    },
    getPortOrder: (orderId) => {
      return instance.getPortOrder(orderId);
    },
    approvePortOrder: (orderId, request) => {
      return instance.approvePortOrder(orderId, request);
    },
    submitPortOrder: (orderId) => {
      return instance.submitPortOrder(orderId);
    },
    cancelPortOrder: (orderId) => {
      return instance.cancelPortOrder(orderId);
    },
    // DECT base methods
    createDECTBase: (data) => {
      return instance.createDECTBase(data);
    },
    getDECTBase: (id) => {
      return instance.getDECTBase(id);
    },
    listDECTBases: (options) => {
      return instance.listDECTBases(options);
    },
    updateDECTBase: (id, data) => {
      return instance.updateDECTBase(id, data);
    },
    deleteDECTBase: (id) => {
      return instance.deleteDECTBase(id);
    },
    // DECT handset methods
    createDECTHandset: (baseId, data) => {
      return instance.createDECTHandset(baseId, data);
    },
    getDECTHandset: (baseId, handsetId) => {
      return instance.getDECTHandset(baseId, handsetId);
    },
    listDECTHandsets: (baseId) => {
      return instance.listDECTHandsets(baseId);
    },
    updateDECTHandset: (baseId, handsetId, data) => {
      return instance.updateDECTHandset(baseId, handsetId, data);
    },
    deleteDECTHandset: (baseId, handsetId) => {
      return instance.deleteDECTHandset(baseId, handsetId);
    },
    // DECT extension methods
    createDECTExtension: (baseId, handsetId, data) => {
      return instance.createDECTExtension(baseId, handsetId, data);
    },
    listDECTExtensions: (baseId, handsetId) => {
      return instance.listDECTExtensions(baseId, handsetId);
    },
    deleteDECTExtension: (baseId, handsetId, extensionId) => {
      return instance.deleteDECTExtension(baseId, handsetId, extensionId);
    },
  };

  return wrapper;
}

/**
 * Register Web Components manually
 *
 * Call this to register the DialStack Web Components when using the pure entry point.
 * This is only needed in browser environments where you want to use dialstack.create().
 *
 * @example
 * ```typescript
 * import { loadDialstackAndInitialize, registerComponents } from '@dialstack/sdk/pure';
 *
 * // Register components when ready (e.g., after hydration)
 * if (typeof window !== 'undefined') {
 *   registerComponents();
 * }
 * ```
 */
export function registerComponents(): void {
  if (typeof window === 'undefined') {
    console.warn('DialStack: registerComponents() called in non-browser environment');
    return;
  }

  // Dynamically import components to trigger registration
  import('../components/call-logs');
  import('../components/voicemails');
  import('../components/phone-number-ordering');
  import('../components/phone-numbers');
}
