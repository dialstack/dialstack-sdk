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
 * Use the regular loadDialstackAndInitialize() from '@dialstack/sdk-js' if you
 * want automatic component registration.
 *
 * @param initParams - Initialization parameters
 * @returns DialStack SDK instance with create(), update(), and logout() methods
 *
 * @example
 * ```typescript
 * import { loadDialstackAndInitialize } from '@dialstack/sdk-js/pure';
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

  // nosemgrep: javascript.node.crypto.timeable-secret-comparison -- typeof check, not a secret comparison
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
    addAppearanceTarget: (element) => {
      instance.addAppearanceTarget(element);
    },
    removeAppearanceTarget: (element) => {
      instance.removeAppearanceTarget(element);
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
    on: (event, handler) => {
      instance.on(event, handler);
    },
    off: (event, handler) => {
      instance.off(event, handler);
    },
    resolveRoutingTarget: (target) => {
      return instance.resolveRoutingTarget(target);
    },
    routingTargets: () => {
      return instance.routingTargets();
    },
    fetchAllPages: (fetchFn) => {
      return instance.fetchAllPages(fetchFn);
    },
    getAppearance: () => {
      return instance.getAppearance();
    },
    // Resource namespaces — delegate directly to the instance properties
    calls: instance.calls,
    voicemails: instance.voicemails,
    phoneNumbers: instance.phoneNumbers,
    availablePhoneNumbers: instance.availablePhoneNumbers,
    phoneNumberOrders: instance.phoneNumberOrders,
    portOrders: instance.portOrders,
    audioClips: instance.audioClips,
    dialPlans: instance.dialPlans,
    schedules: instance.schedules,
    ringGroups: instance.ringGroups,
    queues: instance.queues,
    voiceApps: instance.voiceApps,
    aiAgents: instance.aiAgents,
    sharedVoicemailBoxes: instance.sharedVoicemailBoxes,
    extensions: instance.extensions,
    deskphones: instance.deskphones,
    devices: instance.devices,
    buttonTemplates: instance.buttonTemplates,
    dectBases: instance.dectBases,
    account: instance.account,
    users: instance.users,
    locations: instance.locations,
    addresses: instance.addresses,
  };

  return wrapper;
}

/**
 * Register Web Components manually.
 *
 * Call this when using the pure entry point, in a browser, before
 * `dialstack.create()`. **Await it**: registration happens through dynamic
 * imports, so a component created in the same tick may not be upgraded yet —
 * `document.createElement` would hand back an inert `HTMLUnknownElement` whose
 * setters silently do nothing.
 *
 * Every tag in `ComponentTagName` is registered here. A tag missing from this list
 * is not a partial success: the React wrapper for it throws, because an
 * unregistered element cannot be driven.
 *
 * @example
 * ```typescript
 * import { loadDialstackAndInitialize, registerComponents } from '@dialstack/sdk-js/pure';
 *
 * // Register components when ready (e.g., after hydration)
 * if (typeof window !== 'undefined') {
 *   await registerComponents();
 * }
 * ```
 */
export async function registerComponents(): Promise<void> {
  if (typeof window === 'undefined') {
    console.warn('DialStack: registerComponents() called in non-browser environment');
    return;
  }

  // Awaited together, so the promise settles only once every element is defined.
  // Dispatching these without awaiting made the completion time unobservable, and
  // a caller that created a component immediately got an un-upgraded element.
  await Promise.all([
    import('../components/call-logs'),
    import('../components/voicemails'),
    import('../components/call-history'),
    import('../components/phone-number-ordering'),
    import('../components/phone-numbers'),
    import('../components/ai-agent'),
  ]);
}
