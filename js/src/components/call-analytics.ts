/**
 * Call analytics: over a chosen window, the inbound calls that reached no one
 * and how they ended, customer sentiment, call quality, and call volume
 * against the same window a week earlier.
 *
 * Every read here is a count, so it polls directly.
 */

import type { CallLogFilters, CallSummary } from '../types/components';
import type { CallOutcome, CallAnalyticsRangePreset, QualitySummary } from '../types/call-activity';
import { PollingCard } from './polling-card';
import {
  OUTCOMES,
  QUALITY_THRESHOLDS,
  RANGE_PRESETS,
  SENTIMENT_THRESHOLDS,
  browserTimeZone,
  computeRange,
  customerSentiment,
  directionCounts,
  formatPercent,
  healthLevel,
  outcomeColor,
  outcomeCounts,
  outcomeFilters,
  percentChange,
  poorQuality,
  unservedTotal,
  type Direction,
  type HealthLevel,
  type ComparisonRange,
  type Share,
  type Thresholds,
} from '../utils/call-activity';

const DIRECTIONS: Direction[] = ['inbound', 'outbound', 'internal'];

const LEVEL_COLOR: Record<HealthLevel, string> = {
  good: 'var(--ds-color-success)',
  warning: 'var(--ds-color-warning)',
  critical: 'var(--ds-color-danger)',
  insufficient: 'var(--ds-color-text-secondary)',
};

export class CallAnalyticsComponent extends PollingCard {
  protected readonly tagForEvents = 'dialstack-call-analytics';
  private preset: CallAnalyticsRangePreset = 'today';
  private range: ComparisonRange = computeRange('today');
  private current?: CallSummary;
  private previous?: CallSummary;
  private quality?: QualitySummary;
  private onRangeChange?: (preset: CallAnalyticsRangePreset) => void;
  private onViewCalls?: (filters: CallLogFilters) => void;
  private onViewQuality?: (range: { from: string; to: string }) => void;

  setRange(preset: CallAnalyticsRangePreset): void {
    if (preset === this.preset) return;
    this.preset = preset;
    this.refresh();
  }

  setOnRangeChange(callback: ((preset: CallAnalyticsRangePreset) => void) | undefined): void {
    this.onRangeChange = callback;
  }

  setOnViewCalls(callback: ((filters: CallLogFilters) => void) | undefined): void {
    this.onViewCalls = callback;
    if (this.isInitialized) this.render();
  }

  setOnViewQuality(callback: ((range: { from: string; to: string }) => void) | undefined): void {
    this.onViewQuality = callback;
    if (this.isInitialized) this.render();
  }

  private get granularity(): 'hour' | 'day' {
    return this.preset === 'last7d' ? 'day' : 'hour';
  }

  protected async load(): Promise<void> {
    if (!this.instance) return;
    this.range = computeRange(this.preset, this.now);
    const { from, to, previousFrom, previousTo } = this.range;
    const [current, previous, quality] = await Promise.all([
      this.instance.calls.summary({
        from_date: from.toISOString(),
        to_date: to.toISOString(),
        granularity: this.granularity,
        time_zone: browserTimeZone(),
      }),
      this.instance.calls.summary({
        from_date: previousFrom.toISOString(),
        to_date: previousTo.toISOString(),
      }),
      this.instance.quality
        .summary({ from: from.toISOString(), to: to.toISOString(), granularity: 'hourly' })
        .catch(() => undefined),
    ]);
    this.current = current;
    this.previous = previous;
    this.quality = quality;
  }

  /** The call-list filters for a count, with this window. */
  private callsFilters(filters: CallLogFilters): CallLogFilters {
    return {
      ...filters,
      dateRange: { start: this.range.from.toISOString(), end: this.range.to.toISOString() },
    };
  }

  protected render(): void {
    const picker = `
      <select class="range" aria-label="${this.escapeHtml(this.t('callActivity.analytics.rangeLabel'))}">
        ${RANGE_PRESETS.map(
          (p) =>
            `<option value="${p}" ${p === this.preset ? 'selected' : ''}>${this.escapeHtml(this.t(`callActivity.analytics.range.${p}`))}</option>`
        ).join('')}
      </select>`;
    const body = `
      ${this.renderUnserved()}
      <div class="lower">
        ${this.renderHealth(
          'sentiment',
          this.t('callActivity.analytics.sentimentTitle'),
          this.t('callActivity.analytics.sentimentDescription'),
          customerSentiment(this.current),
          SENTIMENT_THRESHOLDS,
          this.onViewCalls ? this.t('callActivity.analytics.viewCalls') : null
        )}
        ${this.renderHealth(
          'quality',
          this.t('callActivity.analytics.qualityTitle'),
          this.t('callActivity.analytics.qualityDescription'),
          poorQuality(this.quality),
          QUALITY_THRESHOLDS,
          this.onViewQuality ? this.t('callActivity.analytics.viewQuality') : null
        )}
        ${this.renderVolume()}
      </div>`;
    // The picker shows while loading too: changing it is how a slow window is left.
    this.renderCard(this.t('callActivity.analytics.title'), '', body);
    this.shadowRoot?.querySelector('.card-header')?.insertAdjacentHTML('beforeend', picker);
    this.wirePicker();
  }

  private wirePicker(): void {
    const select = this.shadowRoot?.querySelector<HTMLSelectElement>('select.range');
    select?.addEventListener('change', () => {
      this.preset = select.value as CallAnalyticsRangePreset;
      this.onRangeChange?.(this.preset);
      this.refresh();
    });
  }

  private renderUnserved(): string {
    const counts = outcomeCounts(this.current?.breakdown);
    const unserved = unservedTotal(counts);
    const description =
      counts.inbound === 0
        ? this.t('callActivity.analytics.noCalls')
        : this.t('callActivity.analytics.ofInbound', { count: unserved, total: counts.inbound });
    const bar =
      counts.inbound > 0
        ? `<div class="stack" aria-hidden="true">${OUTCOMES.filter((o) => counts[o] > 0)
            .map(
              (o) =>
                `<span style="width:${(counts[o] / counts.inbound) * 100}%;background:${outcomeColor(o)}"></span>`
            )
            .join('')}</div>`
        : '';
    // The counts stay links at zero: the call log is still where to look.
    const tiles = OUTCOMES.map((o) => {
      const label = `<span class="tile-label"><span class="dot" style="background:${outcomeColor(o)}"></span>${this.escapeHtml(this.t(`callActivity.outcome.${o}`))}</span><span class="tile-count num">${counts[o]}</span>`;
      return `<li class="${this.itemClass('')}" part="item outcome-tile">${
        this.onViewCalls
          ? `<button type="button" class="tile" data-outcome="${o}">${label}</button>`
          : `<span class="tile">${label}</span>`
      }</li>`;
    }).join('');
    return `
      <section class="block">
        <h3 class="block-title">${this.escapeHtml(this.t('callActivity.analytics.unservedTitle'))}</h3>
        <p class="card-description">${this.escapeHtml(description)}</p>
        ${bar}
        <ul class="tiles">${tiles}</ul>
        ${this.renderTimeline()}
      </section>`;
  }

  private renderTimeline(): string {
    const buckets = (this.current?.time_series ?? []).map((b) => {
      const counts = outcomeCounts(b.breakdown);
      return { at: new Date(b.bucket), counts, unserved: unservedTotal(counts) };
    });
    if (buckets.length < 2 || buckets.every((b) => b.counts.inbound === 0)) return '';
    const tallest = Math.max(...buckets.map((b) => b.counts.inbound), 1);
    const labelEvery = Math.ceil(buckets.length / 8);
    const byDay = this.granularity === 'day';
    const columns = buckets
      .map((b) => {
        const segments = OUTCOMES.filter((o) => b.counts[o] > 0)
          .map(
            (o) =>
              `<span style="height:${(b.counts[o] / b.counts.inbound) * 100}%;background:${outcomeColor(o)}"></span>`
          )
          .join('');
        const title = this.t('callActivity.analytics.bucketTitle', {
          inbound: b.counts.inbound,
          unserved: b.unserved,
        });
        return `<span class="column" style="height:${Math.max((b.counts.inbound / tallest) * 100, 4)}%" title="${this.escapeHtml(title)}">${segments}</span>`;
      })
      .join('');
    const labels = buckets
      .map(
        (b, i) =>
          `<span>${
            i % labelEvery === 0
              ? this.escapeHtml(
                  byDay
                    ? b.at.toLocaleDateString(this.dateLocale, { weekday: 'short' })
                    : b.at.toLocaleTimeString(this.dateLocale, {
                        hour: '2-digit',
                        hourCycle: 'h23',
                      })
                )
              : ''
          }</span>`
      )
      .join('');
    return `
      <figure class="timeline">
        <figcaption class="small muted">${this.escapeHtml(this.t(byDay ? 'callActivity.analytics.byDay' : 'callActivity.analytics.byHour'))}</figcaption>
        <div class="columns" role="img" aria-label="${this.escapeHtml(this.t('callActivity.analytics.timelineLabel'))}">${columns}</div>
        <div class="labels small muted num" aria-hidden="true">${labels}</div>
      </figure>`;
  }

  private renderHealth(
    which: 'sentiment' | 'quality',
    title: string,
    description: string,
    share: Share,
    thresholds: Thresholds,
    linkLabel: string | null
  ): string {
    const level = healthLevel(share, thresholds);
    return `
      <section class="block health" data-level="${level}">
        <div class="health-head">
          <h3 class="block-title">${this.escapeHtml(title)}</h3>
          <span class="badge" style="background:color-mix(in srgb, ${LEVEL_COLOR[level]} 15%, transparent)"><span class="dot" style="background:${LEVEL_COLOR[level]}"></span>${this.escapeHtml(this.t(`callActivity.analytics.level.${level}`))}</span>
        </div>
        <p class="card-description">${this.escapeHtml(description)}</p>
        <p class="big num">${formatPercent(share)}</p>
        <p class="small muted">${this.escapeHtml(this.t('callActivity.analytics.outOf', { count: share.count, total: share.total }))}</p>
        ${linkLabel ? `<button type="button" class="link small" data-view="${which}">${this.escapeHtml(linkLabel)}</button>` : ''}
      </section>`;
  }

  private renderVolume(): string {
    const now = directionCounts(this.current);
    const before = directionCounts(this.previous);
    const weekday = this.range.from.toLocaleDateString(this.dateLocale, { weekday: 'long' });
    const rows = DIRECTIONS.map((d) => {
      const change = percentChange(now[d], before[d]);
      const label = this.escapeHtml(this.t(`callActivity.analytics.${d}`));
      return `
        <div class="volume-row">
          <dt>${this.onViewCalls ? `<button type="button" class="link" data-direction="${d}">${label}</button>` : label}</dt>
          <dd class="num strong">${now[d]}</dd>
          <dd class="small muted num change">${this.escapeHtml(
            change === null
              ? this.t('callActivity.analytics.noneBefore')
              : this.t('callActivity.analytics.changeFrom', {
                  change: `${change > 0 ? '+' : ''}${change}%`,
                  previous: before[d],
                })
          )}</dd>
        </div>`;
    }).join('');
    return `
      <section class="block">
        <h3 class="block-title">${this.escapeHtml(this.t('callActivity.analytics.volumeTitle'))}</h3>
        <p class="card-description">${this.escapeHtml(this.t(`callActivity.analytics.against.${this.preset}`, { weekday }))}</p>
        <dl class="volume">${rows}</dl>
      </section>`;
  }

  protected override afterRender(): void {
    super.afterRender();
    const root = this.shadowRoot;
    if (!root) return;
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-outcome]')) {
      b.addEventListener('click', () => {
        const f = outcomeFilters(b.dataset.outcome as CallOutcome);
        this.onViewCalls?.(
          this.callsFilters({
            direction: 'inbound',
            ...(f.status ? { status: f.status } : {}),
            ...(f.statuses ? { status: f.statuses } : {}),
            ...(f.connected !== undefined ? { connected: f.connected } : {}),
          })
        );
      });
    }
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
      b.addEventListener('click', () =>
        this.onViewCalls?.(this.callsFilters({ direction: b.dataset.direction as Direction }))
      );
    }
    root
      .querySelector('[data-view="sentiment"]')
      ?.addEventListener('click', () =>
        this.onViewCalls?.(
          this.callsFilters({ direction: 'inbound', remote_sentiment: 'negative' })
        )
      );
    root.querySelector('[data-view="quality"]')?.addEventListener('click', () =>
      this.onViewQuality?.({
        from: this.range.from.toISOString(),
        to: this.range.to.toISOString(),
      })
    );
  }

  protected override componentStyles(): string {
    return `
      .range { font: inherit; padding: 4px 8px; border: 1px solid var(--ds-color-border); border-radius: var(--ds-border-radius); background: var(--ds-color-input-background); color: var(--ds-color-text); }
      .block-title { margin: 0; font-size: var(--ds-font-size-base); font-weight: var(--ds-font-weight-bold); }
      .stack { display: flex; gap: 1px; height: 12px; border-radius: 999px; overflow: hidden; background: var(--ds-color-surface-subtle); margin: 12px 0; }
      .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
      @media (min-width: 640px) { .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
      .tile { display: flex; flex-direction: column; align-items: flex-start; padding: 8px; border-radius: var(--ds-border-radius); background: none; border: 0; font: inherit; color: inherit; text-align: left; width: 100%; }
      button.tile { cursor: pointer; }
      button.tile:hover { background: var(--ds-color-surface-subtle); }
      .tile-label { display: inline-flex; align-items: center; gap: 8px; font-size: var(--ds-font-size-small); color: var(--ds-color-text-secondary); }
      .tile-count { font-size: var(--ds-font-size-xlarge); font-weight: var(--ds-font-weight-bold); }
      .timeline { margin: 16px 0 0; }
      .columns { display: flex; align-items: flex-end; gap: 2px; height: 64px; margin-top: 4px; }
      .column { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; border-radius: 2px; background: var(--ds-color-surface-subtle); }
      .labels { display: flex; gap: 2px; font-size: 10px; }
      .labels span { flex: 1; text-align: center; }
      .lower { display: grid; gap: 24px; border-top: 1px solid var(--ds-color-border); margin-top: 24px; padding-top: 24px; }
      @media (min-width: 640px) { .lower { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (min-width: 1100px) { .lower { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      .health-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 999px; font-size: var(--ds-font-size-small); white-space: nowrap; }
      .badge .dot { width: 8px; height: 8px; }
      .big { margin: 8px 0 0; font-size: 28px; font-weight: var(--ds-font-weight-bold); }
      .health p.small { margin: 0 0 8px; }
      .volume { margin: 8px 0 0; }
      .volume-row { display: flex; align-items: baseline; gap: 12px; padding: 8px 0; border-top: 1px solid var(--ds-color-border-subtle); }
      .volume-row:first-child { border-top: 0; padding-top: 0; }
      .volume-row dt { flex: 1; }
      .volume-row dd { margin: 0; }
      .strong { font-weight: var(--ds-font-weight-bold); }
      .change { width: 7rem; text-align: right; }
    `;
  }
}

if (typeof window !== 'undefined' && !customElements.get('dialstack-call-analytics')) {
  customElements.define('dialstack-call-analytics', CallAnalyticsComponent);
}
