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

// Mock ResizeObserver for jsdom (not available natively)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// Mock CSSStyleSheet constructor + adoptedStyleSheets for jsdom (not available natively).
// Required by ShadowContainer which uses Constructable Stylesheets.
if (
  typeof globalThis.CSSStyleSheet === 'undefined' ||
  !('replaceSync' in CSSStyleSheet.prototype)
) {
  class MockCSSStyleSheet {
    _css = '';
    replaceSync(css: string) {
      this._css = css;
    }
    replace(css: string) {
      this._css = css;
      return Promise.resolve(this);
    }
  }
  globalThis.CSSStyleSheet = MockCSSStyleSheet as unknown as typeof CSSStyleSheet;
}

// Ensure ShadowRoot.prototype.adoptedStyleSheets is writable in jsdom.
if (typeof ShadowRoot !== 'undefined' && !('adoptedStyleSheets' in ShadowRoot.prototype)) {
  Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
    get() {
      return (this as Record<string, unknown>)._adoptedStyleSheets ?? [];
    },
    set(sheets: CSSStyleSheet[]) {
      (this as Record<string, unknown>)._adoptedStyleSheets = sheets;
    },
  });
}
