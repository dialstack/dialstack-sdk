/**
 * DialStack SDK initialization
 */

import { DialStackInstance, DialStackOptions } from './types';
import { createInstance } from './instance';

let dialstackInstance: DialStackInstance | null = null;

/**
 * Initialize the DialStack SDK
 */
export function initialize(options: DialStackOptions): DialStackInstance {
  dialstackInstance = createInstance(options);
  return dialstackInstance;
}

/**
 * Get the current DialStack instance
 */
export function getInstance(): DialStackInstance | null {
  return dialstackInstance;
}
