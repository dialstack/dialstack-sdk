/**
 * To call back: callers from the last 7 days nobody has reached since, each
 * with a timeline of their tries and ours, longest waiting first.
 */

import type { CallListParams, CallLog, RemoteNumber } from '../types/components';
import { PollingCard } from './polling-card';
import {
  AXIS_TICKS,
  OUTCOMES,
  attemptMarks,
  groupAttempts,
  callsSignature,
  readAllPages,
  lookbackStart,
  outcomeColor,
  positionAt,
  spreadPositions,
  waitPosition,
  formatWhen,
  formatSince,
  type AttemptMark,
} from '../utils/call-activity';

const COLLAPSED_ROWS = 8;

function pct(position: number): string {
  return `${(position * 100).toFixed(2)}%`;
}

/** Longest waiting first: the caller who has waited longest is the one to call back. */
export function sortWaiting(callers: RemoteNumber[]): RemoteNumber[] {
  return [...callers].sort(
    (a, b) =>
      Date.parse(a.unconnected_inbound.first_at ?? a.last_call_at) -
      Date.parse(b.unconnected_inbound.first_at ?? b.last_call_at)
  );
}

export class ToCallBackComponent extends PollingCard {
  protected readonly tagForEvents = 'dialstack-to-call-back';
  private callers: RemoteNumber[] = [];
  private attempts = new Map<string, CallLog[]>();
  private expanded = false;
  private onCallerSelect?: (event: { phoneNumber: string }) => void;

  setOnCallerSelect(callback: ((event: { phoneNumber: string }) => void) | undefined): void {
    this.onCallerSelect = callback;
    if (this.isInitialized) this.render();
  }

  protected override async signature(): Promise<string> {
    if (!this.instance) return '';
    // Both directions: a call-back that connects takes a caller off the list,
    // and one that does not adds a mark, though no inbound count moves.
    const summary = await this.instance.calls.summary({
      from_date: lookbackStart(this.now).toISOString(),
      to_date: this.now.toISOString(),
    });
    return callsSignature(summary);
  }

  protected async load(): Promise<void> {
    if (!this.instance) return;
    const since = lookbackStart(this.now);
    const page = await this.instance.remoteNumbers.list({
      unconnected_inbound_count: { gte: 1 },
      unconnected_inbound_last_at: { gte: since.toISOString() },
      limit: 100,
    });
    this.callers = sortWaiting(page.data);
    const numbers = this.callers.map((c) => c.phone_number);
    if (numbers.length === 0) {
      this.attempts = new Map();
      return;
    }
    // Two reads whatever the number of callers: their calls, and ours to them.
    // Every page: the oldest tries belong to the longest-waiting callers, who
    // are listed first.
    const list = (params: CallListParams) => this.instance!.calls.list(params);
    const [theirs, ours] = await Promise.all([
      readAllPages(list, {
        from_number: numbers,
        direction: 'inbound',
        connected: false,
        from_date: since.toISOString(),
        limit: 100,
      }),
      readAllPages(list, {
        to_number: numbers,
        direction: 'outbound',
        connected: false,
        from_date: since.toISOString(),
        limit: 100,
      }),
    ]);
    this.attempts = groupAttempts([...theirs, ...ours], this.callers, since);
  }

  protected render(): void {
    const shown = this.expanded ? this.callers : this.callers.slice(0, COLLAPSED_ROWS);
    const marksByNumber = new Map(
      shown.map((c) => [c.phone_number, attemptMarks(this.attempts.get(c.phone_number) ?? [])])
    );
    const kinds = new Set([...marksByNumber.values()].flat().map((m) => m.kind));

    let body: string;
    if (this.callers.length === 0) {
      body = `<p class="muted">${this.escapeHtml(this.t('callActivity.toCallBack.none'))}</p>`;
    } else {
      const more =
        this.callers.length > COLLAPSED_ROWS
          ? `<button type="button" class="link small toggle">${this.escapeHtml(
              this.expanded
                ? this.t('callActivity.toCallBack.showFewer')
                : this.t('callActivity.toCallBack.showAll', { count: this.callers.length })
            )}</button>`
          : '';
      body = `
        <div class="grid">
          ${this.renderAxis()}
          <ul class="rows">${shown.map((c) => this.renderRow(c, marksByNumber.get(c.phone_number) ?? [])).join('')}</ul>
        </div>
        ${more}`;
    }
    this.renderCard(
      this.t('callActivity.toCallBack.title'),
      this.t('callActivity.toCallBack.description'),
      body,
      kinds.size > 0 ? this.renderLegend(kinds) : ''
    );
  }

  protected override afterRender(): void {
    super.afterRender();
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelector('.toggle')?.addEventListener('click', () => {
      this.expanded = !this.expanded;
      this.render();
    });
    if (this.onCallerSelect) {
      for (const row of root.querySelectorAll<HTMLElement>('[data-number]')) {
        const select = () => this.onCallerSelect?.({ phoneNumber: row.dataset.number ?? '' });
        row.addEventListener('click', select);
        row.addEventListener('keydown', (e) => {
          // A key on the row's own copy button is that button's.
          if ((e.target as HTMLElement).closest('button')) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            select();
          }
        });
      }
    }
  }

  private renderAxis(): string {
    const ticks = AXIS_TICKS.map((tick) => {
      const left = waitPosition(tick.minutes);
      const transform = left === 0 ? 'none' : left === 1 ? 'translateX(-100%)' : 'translateX(-50%)';
      const label =
        tick.unit === 'now'
          ? this.t('callActivity.toCallBack.axisNow')
          : this.t(
              tick.unit === 'days'
                ? 'callActivity.toCallBack.axisDays'
                : 'callActivity.toCallBack.axisHours',
              {
                count: tick.count,
              }
            );
      return `<span class="tick" style="left:${pct(left)};transform:${transform}">${this.escapeHtml(label)}</span>`;
    }).join('');
    return `
      <span class="axis-spacer"></span>
      <span class="axis" aria-hidden="true">${ticks}</span>
      <span class="axis-waiting small muted">${this.escapeHtml(this.t('callActivity.toCallBack.axisWaiting'))}</span>`;
  }

  private renderRow(caller: RemoteNumber, marks: AttemptMark[]): string {
    const { unconnected_inbound: inbound, unconnected_outbound: outbound } = caller;
    const since = inbound.first_at ?? caller.last_call_at;
    const at = spreadPositions(marks.map((m) => positionAt(m.at, this.now)));
    const details = [
      this.t('callActivity.toCallBack.tries', { count: inbound.count }),
      inbound.voicemail_count > 0 ? this.t('callActivity.toCallBack.leftVoicemail') : null,
      outbound.count > 0
        ? this.t('callActivity.toCallBack.weTried', { count: outbound.count })
        : null,
    ].filter((d): d is string => d !== null);
    const name = caller.name ?? this.t('callActivity.unknownCaller');
    const yesterday = (time: string) => this.t('callActivity.yesterdayAt', { time });

    const dots = marks
      .map((mark, i) => {
        const what =
          mark.kind === 'callBack'
            ? this.t('callActivity.toCallBack.weCalled')
            : mark.kind === 'failed' && mark.status
              ? `${this.t('callActivity.outcome.failed')} (${this.t(`callActivity.status.${mark.status}`)})`
              : this.t(`callActivity.outcome.${mark.kind}`);
        const title = this.t('callActivity.toCallBack.markTitle', {
          what,
          when: formatWhen(new Date(mark.at), this.now, this.dateLocale, yesterday),
        });
        const style =
          mark.kind === 'callBack'
            ? `left:${pct(at[i] ?? 0)}`
            : `left:${pct(at[i] ?? 0)};background:${outcomeColor(mark.kind)}`;
        return `<span class="mark ${mark.kind === 'callBack' ? 'call-back' : ''}" data-testid="to-call-back-mark" style="${style}" title="${this.escapeHtml(title)}"></span>`;
      })
      .join('');
    const barLeft = pct(Math.min(positionAt(since, this.now), at[0] ?? 1));
    const selectable = this.onCallerSelect ? `tabindex="0" role="button"` : '';
    const waited = formatSince(new Date(since), this.now, {
      days: (n) => this.t('callActivity.days', { count: n }),
      hours: (n) => this.t('callActivity.hours', { count: n }),
      minutes: (n) => this.t('callActivity.minutes', { count: n }),
    });

    return `
      <li class="${this.itemClass(`row ${this.onCallerSelect ? 'selectable' : ''}`)}" part="item caller-row" data-number="${this.escapeHtml(caller.phone_number)}" ${selectable}>
        <span class="who">
          <span class="name ${caller.name ? '' : 'muted'}">${this.escapeHtml(name)}</span>
          <span class="details small muted"><span class="number">${this.renderPhoneNumber(caller.phone_number)}</span>, ${this.escapeHtml(details.join(', '))}</span>
        </span>
        <span class="track" aria-hidden="true">
          <span class="line"></span>
          <span class="bar" style="left:${barLeft}"></span>
          ${dots}
        </span>
        <span class="waited num">${this.escapeHtml(waited)}</span>
      </li>`;
  }

  private renderLegend(kinds: Set<AttemptMark['kind']>): string {
    const items = OUTCOMES.filter((o) => kinds.has(o)).map(
      (o) =>
        `<span class="legend-item"><span class="dot" style="background:${outcomeColor(o)}"></span>${this.escapeHtml(this.t(`callActivity.outcome.${o}`))}</span>`
    );
    if (kinds.has('callBack')) {
      items.push(
        `<span class="legend-item"><span class="dot hollow"></span>${this.escapeHtml(this.t('callActivity.toCallBack.weCalled'))}</span>`
      );
    }
    return `<span class="legend small muted">${items.join('')}</span>`;
  }

  protected override componentStyles(): string {
    return `
      .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: center; justify-content: flex-end; }
      .legend-item { display: inline-flex; align-items: center; gap: 6px; }
      .dot.hollow { border: 2px solid var(--ds-color-text); background: var(--ds-color-background); }
      .grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
      .axis, .axis-spacer, .axis-waiting, .track { display: none; }
      .rows { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; }
      .row { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: center; padding: 10px 8px; margin: 0 -8px; border-top: 1px solid var(--ds-color-border-subtle); border-radius: var(--ds-border-radius); }
      .row:first-child { border-top: 0; }
      .row.selectable { cursor: pointer; }
      .row.selectable:hover { background: var(--ds-color-surface-subtle); }
      .who { min-width: 0; padding-right: 16px; }
      .name { display: block; font-weight: var(--ds-font-weight-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .details { display: block; }
      .details .number { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; vertical-align: middle; }
      .waited { padding-left: 16px; text-align: right; font-weight: var(--ds-font-weight-bold); font-size: var(--ds-font-size-small); }
      @media (min-width: 640px) {
        .grid { grid-template-columns: 17rem minmax(0, 1fr) 7rem; }
        .axis-spacer, .axis-waiting { display: block; }
        .axis-waiting { padding-left: 16px; text-align: right; margin-bottom: 4px; }
        .axis { display: block; position: relative; height: 16px; margin-bottom: 4px; font-size: var(--ds-font-size-small); color: var(--ds-color-text-secondary); font-variant-numeric: tabular-nums; }
        .tick { position: absolute; white-space: nowrap; }
        .track { display: block; position: relative; height: 24px; }
      }
      .line { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: var(--ds-color-border); }
      .bar { position: absolute; right: 0; top: 50%; height: 6px; transform: translateY(-50%); border-radius: 999px 0 0 999px; background: color-mix(in srgb, var(--ds-color-danger) 20%, transparent); }
      .mark { position: absolute; top: 50%; width: 10px; height: 10px; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 2px var(--ds-color-background); }
      .mark.call-back { border: 2px solid var(--ds-color-text); background: var(--ds-color-background); }
      .toggle { margin-top: 8px; }
    `;
  }
}

if (typeof window !== 'undefined' && !customElements.get('dialstack-to-call-back')) {
  customElements.define('dialstack-to-call-back', ToCallBackComponent);
}
