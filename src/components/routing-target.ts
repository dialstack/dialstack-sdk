/**
 * Internal routing target display component
 *
 * Renders an icon + resolved name for a routing target TypeID.
 * Not exported as a public SDK component — used internally by phone-numbers.
 */

import { BaseComponent } from './base-component';

const ROUTING_TARGET_ICONS: Record<string, string> = {
  user: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
  dial_plan: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z"/></svg>`,
  voice_app: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`,
  ring_group: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  queue: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M4 17h2v.5H5v1h1v.5H4v1h3v-4H4v1zm1-9h1V4H4v1h1v3zm-1 3h1.8L4 13.1v.9h3v-1H5.2L7 10.9V10H4v1zm5-6v2h12V5H9zm0 14h12v-2H9v2zm0-6h12v-2H9v2z"/></svg>`,
  shared_voicemail: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18.5 6C15.46 6 13 8.46 13 11.5c0 1.33.47 2.55 1.26 3.5H9.74c.79-.95 1.26-2.17 1.26-3.5C11 8.46 8.54 6 5.5 6S0 8.46 0 11.5 2.46 17 5.5 17h13c3.04 0 5.5-2.46 5.5-5.5S21.54 6 18.5 6zM5.5 15C3.57 15 2 13.43 2 11.5S3.57 8 5.5 8 9 9.57 9 11.5 7.43 15 5.5 15zm13 0c-1.93 0-3.5-1.57-3.5-3.5S16.57 8 18.5 8 22 9.57 22 11.5 20.43 15 18.5 15z"/></svg>`,
};

export class RoutingTargetComponent extends BaseComponent {
  static get observedAttributes(): string[] {
    return ['target'];
  }

  private resolvedName: string | null = null;
  private resolvedType: string | null = null;
  private isLoadingTarget: boolean = false;
  private loadVersion: number = 0;
  private abortController: AbortController | null = null;

  protected initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.render();
    this.loadTarget();
  }

  disconnectedCallback(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.loadVersion++;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'target' && oldValue !== newValue) {
      this.resolvedName = null;
      this.resolvedType = null;
      if (this.isInitialized) {
        this.loadTarget();
      }
    }
  }

  private get target(): string | null {
    return this.getAttribute('target');
  }

  private async loadTarget(): Promise<void> {
    const target = this.target;
    if (!target || !this.instance) {
      this.render();
      return;
    }

    // Abort any previous in-flight load
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const version = ++this.loadVersion;
    this.isLoadingTarget = true;
    this.render();

    try {
      const result = await this.instance.resolveRoutingTarget(target);
      if (signal.aborted || version !== this.loadVersion) return;
      if (result) {
        this.resolvedName = result.name;
        this.resolvedType = result.type;
      }
    } catch {
      if (signal.aborted || version !== this.loadVersion) return;
    }
    this.isLoadingTarget = false;
    this.render();
  }

  // Renders the component using Shadow DOM innerHTML — all dynamic content
  // (resolvedName) is escaped via escapeHtml() inherited from BaseComponent.
  // This follows the same trusted template pattern as all other SDK components.
  protected render(): void {
    if (!this.shadowRoot) return;

    if (!this.target) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    if (this.isLoadingTarget) {
      this.shadowRoot.innerHTML = `
        <style>${this.getStyles()}</style>
        <span class="skeleton"></span>
      `;
      return;
    }

    if (!this.resolvedName) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    const icon = this.resolvedType ? ROUTING_TARGET_ICONS[this.resolvedType] || '' : '';

    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      <span class="routing-target">
        ${icon ? `<span class="icon" aria-hidden="true">${icon}</span>` : ''}
        <span class="name">${this.escapeHtml(this.resolvedName)}</span>
      </span>
    `;
  }

  private getStyles(): string {
    return `
      :host {
        display: inline;
      }

      .routing-target {
        display: inline-flex;
        align-items: center;
        gap: var(--ds-spacing-xs);
        font-size: inherit;
        color: var(--ds-color-text-primary, #1a1a2e);
        background: var(--ds-color-surface-secondary, #f0f0f5);
        border: 1px solid var(--ds-color-border, rgba(0, 0, 0, 0.08));
        border-radius: 999px;
        padding: 2px var(--ds-spacing-md) 2px var(--ds-spacing-sm);
        cursor: default;
        transition: background 0.15s ease;
      }

      .routing-target:hover {
        background: var(--ds-color-surface-tertiary, #e4e4ec);
      }

      .icon {
        display: inline-flex;
        align-items: center;
        opacity: 0.55;
      }

      .icon svg {
        width: 13px;
        height: 13px;
      }

      .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
        line-height: 1.4;
      }

      .skeleton {
        display: inline-block;
        width: 80px;
        height: 1em;
        border-radius: var(--ds-border-radius);
        background: linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.06) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
      }

      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `;
  }
}

// Register the custom element (internal only)
if (typeof window !== 'undefined' && !customElements.get('dialstack-routing-target')) {
  customElements.define('dialstack-routing-target', RoutingTargetComponent);
}
