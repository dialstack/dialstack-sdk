/**
 * DialStack SDK initialization
 */

import type { DialStackInstance, DialStackInitParams } from './types';
import { DialStackInstanceImplClass } from './instance';

// Import components to ensure they self-register (browser-guarded internally)
import '../components/call-logs';
import '../components/voicemails';

/**
 * Load and initialize the DialStack SDK
 *
 * This function:
 * 1. Creates a DialStack instance
 * 2. Eagerly starts fetching the client secret in the background
 * 3. Returns a synchronous wrapper that queues operations until ready
 *
 * @param initParams - Initialization parameters
 * @returns DialStack SDK instance with create(), update(), and logout() methods
 *
 * @example
 * ```typescript
 * const dialstack = await loadDialstackAndInitialize({
 *   publishableKey: 'pk_test_...',
 *   fetchClientSecret: async () => {
 *     const response = await fetch('/api/dialstack/session');
 *     const data = await response.json();
 *     return data.clientSecret;
 *   },
 *   appearance: {
 *     theme: 'light',
 *     variables: {
 *       colorPrimary: '#6772E5'
 *     }
 *   }
 * });
 *
 * const callLogs = dialstack.create('call-logs');
 * document.getElementById('container').appendChild(callLogs);
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
    on: (event, handler) => {
      instance.on(event, handler);
    },
    off: (event, handler) => {
      instance.off(event, handler);
    },
  };

  return wrapper;
}

/**
 * Legacy support: Backwards-compatible initialization methods
 * (Deprecated - use loadDialstackAndInitialize instead)
 */

let legacyInstance: DialStackInstance | null = null;

/**
 * @deprecated Use loadDialstackAndInitialize() instead
 */
export async function initialize(
  initParams: DialStackInitParams
): Promise<DialStackInstance> {
  legacyInstance = await loadDialstackAndInitialize(initParams);
  return legacyInstance;
}

/**
 * @deprecated Use the instance returned by loadDialstackAndInitialize() instead
 */
export function getInstance(): DialStackInstance | null {
  return legacyInstance;
}
