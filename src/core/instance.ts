/**
 * DialStack SDK instance management
 */

import { DialStackInstance, DialStackOptions } from './types';

const DEFAULT_API_URL = 'https://api.dialstack.ai';

/**
 * Create a DialStack SDK instance
 */
export function createInstance(options: DialStackOptions): DialStackInstance {
  if (!options.publishableKey) {
    throw new Error('DialStack: publishableKey is required');
  }

  if (!options.publishableKey.startsWith('pk_live_') && !options.publishableKey.startsWith('pk_test_')) {
    throw new Error('DialStack: publishableKey must start with pk_live_ or pk_test_');
  }

  return {
    publishableKey: options.publishableKey,
    apiUrl: options.apiUrl || DEFAULT_API_URL,
  };
}
