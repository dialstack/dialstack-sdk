/**
 * The card the call activity components are built on: a polling loop that
 * reads a cheap signature (counts, not call content) and re-reads the full
 * data only when it changes, at least hourly, or on refresh(), plus the card
 * frame and copy-number button they share.
 */

import { BaseComponent } from './base-component';
import type { CallActivityClasses } from '../types/appearance';
import { HOUR } from '../utils/call-activity';
import { attachCopyButtons, renderCopyNumber } from './copy-number';

export const DEFAULT_POLL_MS = 60_000;

/**
 * Polls a cheap signature (counts, not call content) and reads the full data
 * only when it changes, at least hourly, or on refresh(). For the lists, the
 * full read is a PHI read in the audit log, which polling must not flood.
 */
export abstract class PollingCard extends BaseComponent {
  protected override classes: CallActivityClasses = {};

  /** Custom classes for the card's frame, header, title and rows. */
  override setClasses(classes: CallActivityClasses): void {
    const next = this.mergeIfChanged(this.classes, classes);
    if (!next) return;
    this.classes = next;
    if (this.isInitialized) this.render();
  }

  /** The class a row or tile takes, with the host's `item` class. */
  protected itemClass(base: string): string {
    return this.classes.item ? `${base} ${this.classes.item}` : base;
  }

  protected pollMs: number | null = DEFAULT_POLL_MS;
  protected isLoading = true;
  protected loadError: string | null = null;
  /** The moment the data on screen describes; injectable for stable stories. */
  protected now = new Date();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSignature: string | null = null;
  private lastHour = -1;
  private ticking = false;
  private pendingForce = false;

  /** A cheap read whose result changes when the data would. Default: always read. */
  protected async signature(): Promise<string> {
    return String(Date.now());
  }

  /** The full read. */
  protected abstract load(): Promise<void>;

  protected abstract readonly tagForEvents: string;

  protected initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.render();
    void this.tick(true);
    this.restartTimer();
  }

  protected override cleanup(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.isInitialized && !this.timer) this.restartTimer();
  }

  setPollInterval(ms: number | null): void {
    this.pollMs = ms;
    if (this.isInitialized) this.restartTimer();
  }

  refresh(): void {
    if (this.isInitialized) void this.tick(true);
  }

  private restartTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = this.pollMs ? setInterval(() => void this.tick(false), this.pollMs) : null;
  }

  protected async tick(force: boolean): Promise<void> {
    if (!this.instance) return;
    // A forced tick that arrives mid-read (a new mailbox, range or Refresh)
    // runs once that read ends rather than being lost.
    if (this.ticking) {
      if (force) this.pendingForce = true;
      return;
    }
    this.ticking = true;
    try {
      // A loop, not a call after the read: every way out of a pass (no
      // change, a read, a failure) still runs a forced pass queued during it.
      for (let pass = force; ; pass = true) {
        this.pendingForce = false;
        await this.readOnce(pass);
        if (!this.pendingForce) break;
      }
    } finally {
      this.ticking = false;
    }
  }

  private async readOnce(force: boolean): Promise<void> {
    let changed = false;
    try {
      this.now = new Date();
      const sig = await this.signature();
      const hour = Math.floor(this.now.getTime() / HOUR);
      if (!force && sig === this.lastSignature && hour === this.lastHour && !this.loadError) return;
      changed = true;
      if (this.isLoading) this._onLoaderStart?.({ elementTagName: this.tagForEvents });
      await this.load();
      // Remembered only once the read succeeded, so a failed one is tried
      // again on the next tick rather than an hour later.
      this.lastSignature = sig;
      this.lastHour = hour;
      this.loadError = null;
    } catch (err) {
      changed = true;
      this.loadError = err instanceof Error ? err.message : String(err);
      this._onLoadError?.({ error: this.loadError, elementTagName: this.tagForEvents });
    } finally {
      const wasLoading = this.isLoading;
      this.isLoading = false;
      // Re-rendering replaces the shadow DOM, which would stop a voicemail
      // playing, close an open select and drop focus every poll; only redraw
      // when there is something new to show.
      if (changed || wasLoading) this.render();
    }
  }

  // ---- shared rendering --------------------------------------------------

  protected cardStyles(): string {
    return `
      :host { display: block; }
      .card {
        background: var(--ds-color-background);
        color: var(--ds-color-text);
        border: 1px solid var(--ds-color-border);
        border-radius: var(--ds-border-radius-large);
        padding: var(--ds-layout-spacing-lg);
        font-size: var(--ds-font-size-base);
        line-height: var(--ds-line-height);
      }
      .card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ds-spacing-md); margin-bottom: var(--ds-layout-spacing-md); flex-wrap: wrap; }
      .card-title { margin: 0; font-size: var(--ds-font-size-large); font-weight: var(--ds-font-weight-bold); }
      .card-description { margin: 2px 0 0; color: var(--ds-color-text-secondary); font-size: var(--ds-font-size-small); }
      .muted { color: var(--ds-color-text-secondary); }
      .small { font-size: var(--ds-font-size-small); }
      .num { font-variant-numeric: tabular-nums; }
      .skeleton { height: 14px; border-radius: var(--ds-border-radius); background: var(--ds-color-surface-subtle); margin: 8px 0; }
      .error { color: var(--ds-color-text-secondary); font-size: var(--ds-font-size-small); }
      .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .link { background: none; border: 0; padding: 0; font: inherit; color: var(--ds-color-primary); cursor: pointer; text-align: left; }
      .link:hover { text-decoration: underline; }
      .icon-button { background: none; border: 0; padding: 4px; border-radius: var(--ds-border-radius); color: var(--ds-color-text-secondary); cursor: pointer; display: inline-flex; }
      .icon-button:hover { color: var(--ds-color-text); background: var(--ds-color-surface-subtle); }
      .icon-button svg { width: 16px; height: 16px; }
      .copy svg { width: 14px; height: 14px; }
      ul { list-style: none; margin: 0; padding: 0; }
    `;
  }

  protected renderCard(title: string, description: string, body: string, action = ''): void {
    if (!this.shadowRoot) return;
    const content = this.isLoading
      ? '<div class="skeleton"></div><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:85%"></div>'
      : this.loadError
        ? `<p class="error" role="alert">${this.escapeHtml(this.t('callActivity.failedToLoad'))}</p>`
        : body;
    this.shadowRoot.innerHTML = `
      <style>${this.applyAppearanceStyles()}${this.cardStyles()}${this.componentStyles()}</style>
      <section class="card ${this.classes.card ?? ''} ${this.getClassNames('base')}" part="card">
        <div class="card-header ${this.classes.header ?? ''}" part="card-header">
          <div><h2 class="card-title ${this.classes.title ?? ''}" part="card-title">${this.escapeHtml(title)}</h2>${description ? `<p class="card-description" part="card-description">${this.escapeHtml(description)}</p>` : ''}</div>
          ${this.isLoading || this.loadError ? '' : action}
        </div>
        <div class="card-body" part="card-body">${content}</div>
      </section>`;
    this.afterRender();
  }

  protected componentStyles(): string {
    return '';
  }

  /** Wire listeners after each render. */
  protected afterRender(): void {
    attachCopyButtons(this.shadowRoot, this.copyLabels());
  }

  /** A number to call back, with its copy button. */
  protected renderPhoneNumber(e164: string): string {
    return renderCopyNumber(e164, this.copyLabels());
  }

  private copyLabels() {
    return {
      copy: (number: string) => this.t('callActivity.copyNumber', { number }),
      copied: this.t('callActivity.copied'),
    };
  }

  protected get dateLocale(): string {
    return this.formatting.dateLocale || 'en-US';
  }
}
