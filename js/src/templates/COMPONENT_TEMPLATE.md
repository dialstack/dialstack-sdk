# Component Template Guide

This guide outlines how to add new components to the DialStack SDK, following the established patterns.

## Overview

Each component has two parts, and they now live in **two different packages**:

1. **Web Component** (`@dialstack/sdk-js`, `js/src/components/`) — the native custom
   element with Shadow DOM
2. **React Wrapper** (`@dialstack/sdk-react`, `react/src/react/`) — a React component
   that wraps it

The wrapper reaches the element's types by importing `@dialstack/sdk-js` by package
name, never by a relative path across the tree — eslint fails the build otherwise,
because a relative path would not survive publishing.

## Step 1: Create the Web Component

Create a new file in `js/src/components/`:

```typescript
// js/src/components/new-component.ts

import { BaseComponent } from './base-component';
import type { FormattingOptions, LoaderStart, LoadError } from '../core/types';

/**
 * API response structure
 */
interface NewComponentResponse {
  items: NewComponentItem[];
  count: number;
}

interface NewComponentItem {
  id: string;
  // ... other fields
}

/**
 * NewComponent Web Component
 */
export class NewComponentComponent extends BaseComponent {
  private isLoading = false;
  private error: string | null = null;
  private items: NewComponentItem[] = [];

  // Component-specific callbacks
  private _onItemSelect?: (event: { itemId: string }) => void;

  protected initialize(): void {
    if (this.isInitialized) return;
    this.render();
    this.loadData();
    this.isInitialized = true;
  }

  // Callback setters (for React integration)
  setOnItemSelect(callback: (event: { itemId: string }) => void): void {
    this._onItemSelect = callback;
  }

  // Data loading
  private async loadData(): Promise<void> {
    if (!this.instance) {
      this.error = this.t('common.error');
      this.render();
      return;
    }

    this._onLoaderStart?.({ elementTagName: 'dialstack-new-component' });
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const data = await this.fetchComponentData<NewComponentResponse>('/v1/new-component');
      this.items = data.items || [];
      this.error = null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error loading data';
      this.error = errorMessage;
      this._onLoadError?.({ error: errorMessage, elementTagName: 'dialstack-new-component' });
      this.items = [];
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  protected render(): void {
    if (!this.shadowRoot) return;

    const styles = this.applyAppearanceStyles();

    this.shadowRoot.innerHTML = `
      <style>
        ${styles}
        /* Component-specific styles using CSS variables */
        .container {
          background: var(--ds-color-background);
          color: var(--ds-color-text);
        }
      </style>
      <div class="container" role="region" aria-label="${this.t('newComponent.title')}">
        ${this.renderContent()}
      </div>
    `;

    this.attachEventListeners();
  }

  private renderContent(): string {
    if (this.isLoading) {
      return `<div class="loading">${this.t('common.loading')}</div>`;
    }
    if (this.error) {
      return `<div class="error">${this.error}</div>`;
    }
    // Render items
    return this.items.map((item) => `<div>${item.id}</div>`).join('');
  }

  private attachEventListeners(): void {
    // Attach event listeners to shadow DOM elements
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-new-component')) {
  customElements.define('dialstack-new-component', NewComponentComponent);
}
```

## Step 2: Update Types

Add to `js/src/types/components.ts`:

```typescript
// Add to ComponentTagName union
export type ComponentTagName = 'call-logs' | 'voicemails' | 'new-component';

// Declare the element's own interface beside the others, then add it to the map.
// Each extends BaseComponentElement rather than inlining `HTMLElement & { … }`.
export interface NewComponentElement extends BaseComponentElement {
  setItems: (items: string[]) => void;
}

// Add to the ComponentElement map. Keys are quoted because every tag name is
// hyphenated — that is also why `document.createElement` cannot validate them, and
// why an unregistered element fails silently rather than throwing.
export interface ComponentElement {
  'call-logs': CallLogsElement;
  voicemails: VoicemailsElement;
  'new-component': NewComponentElement;
}

// Add callbacks interface
export interface NewComponentCallbacks extends CommonComponentCallbacks {
  onItemSelect?: (event: { itemId: string }) => void;
}
```

## Step 3: Create React Wrapper

Create a new file in `react/src/react/`:

````typescript
// src/react/NewComponent.tsx

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateWithSetter } from './useUpdateWithSetter';
import type { LoaderStart, LoadError, FormattingOptions } from '../core/types';
import type { Locale } from '../locales';

export interface NewComponentProps {
  // Required props first
  someRequiredProp: string;

  // Optional styling props
  className?: string;
  style?: React.CSSProperties;

  // Optional configuration
  locale?: Locale;
  formatting?: FormattingOptions;

  // Callbacks (all optional)
  onLoaderStart?: (event: LoaderStart) => void;
  onLoadError?: (event: LoadError) => void;
  onItemSelect?: (event: { itemId: string }) => void;
}

/**
 * NewComponent displays...
 *
 * Must be used within a DialstackComponentsProvider.
 *
 * @example
 * ```tsx
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <NewComponent
 *     someRequiredProp="value"
 *     onItemSelect={(e) => console.log('Selected:', e.itemId)}
 *   />
 * </DialstackComponentsProvider>
 * ```
 */
export const NewComponent: React.FC<NewComponentProps> = ({
  someRequiredProp,
  className,
  style,
  locale,
  formatting,
  onLoaderStart,
  onLoadError,
  onItemSelect,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'new-component');

  // Sync data props
  useUpdateWithSetter(componentInstance, someRequiredProp, 'setSomeRequiredProp');

  // Sync configuration
  useUpdateWithSetter(componentInstance, locale, 'setLocale');
  useUpdateWithSetter(componentInstance, formatting, 'setFormatting');

  // Sync callbacks
  useUpdateWithSetter(componentInstance, onLoaderStart, 'setOnLoaderStart');
  useUpdateWithSetter(componentInstance, onLoadError, 'setOnLoadError');
  useUpdateWithSetter(componentInstance, onItemSelect, 'setOnItemSelect');

  return <div ref={containerRef} className={className} style={style} />;
};
````

## Step 4: Export the Component

Three edits, because the two halves publish separately.

**Register the element** — add a bare import to `js/src/core/initialize.ts` beside the
others. That side effect is what defines the element; without it
`document.createElement` returns an inert node that renders nothing, and
`useCreateComponent` throws to say so.

```typescript
import '../components/new-component';
```

**Give the React wrapper its own entry point** — create `react/src/new-component.ts`:

```typescript
export { NewComponent } from './react/NewComponent';
export type { NewComponentProps } from './react/NewComponent';
```

**Declare that entry** in `react/package.json` under `exports`, with `types` first:

```json
"./new-component": {
  "types": "./dist/new-component.d.ts",
  "import": "./dist/new-component.mjs",
  "require": "./dist/new-component.cjs"
}
```

Do **not** add it to `react/src/index.ts`. Components are deliberately absent from
the package root: a barrel makes the whole module graph reachable from any single
import, which is what made a softphone-only consumer pay for the dial-plan editor.
The rollup config generates the new entry from `COMPONENT_ENTRIES`, and
`scripts/sdk-release/config.go` needs a matching `SubpathLabels` entry or the release
will refuse to run.

## Step 5: Add Locale Strings

Update `js/src/locales/en.ts`:

```typescript
export const defaultLocale = {
  // ... existing strings
  newComponent: {
    title: 'New Component',
    loading: 'Loading...',
    empty: 'No items found',
  },
};
```

## Step 6: Write Tests

Create `react/src/react/__tests__/NewComponent.test.tsx`:

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react';
import { NewComponent } from '../NewComponent';
import { DialstackComponentsProvider } from '../DialstackComponentsProvider';

// ... tests
```

## Checklist

- [ ] Web Component extends BaseComponent
- [ ] All colors use CSS variables (no hard-coded colors)
- [ ] All strings use the `t()` function for i18n
- [ ] Callbacks use object destructuring: `(event: { id: string }) => void`
- [ ] Props interface documented with JSDoc
- [ ] React wrapper uses useUpdateWithSetter for all props
- [ ] Component registered with customElements.define
- [ ] Types added to ComponentTagName and ComponentElement
- [ ] Component exported from index.ts
- [ ] Tests written for React wrapper
