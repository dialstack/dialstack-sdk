/**
 * Jest setup file - runs before each test
 *
 * This file is excluded from the main build and only used by Jest.
 */

import '@testing-library/jest-dom';

// Define build-time constant that Rollup normally injects
declare global {
  const _NPM_PACKAGE_VERSION_: string;
}
(globalThis as Record<string, unknown>)._NPM_PACKAGE_VERSION_ = '0.0.0-test';
