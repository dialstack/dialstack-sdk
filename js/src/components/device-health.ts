/**
 * Device health, titled "Devices offline" while that is all it shows: desk
 * phones with a user and DECT bases that have been
 * online before, which are not registered now, longest offline first.
 */

import type { Device } from '../types/device';
import { deviceDisplayName } from '../utils/device-display-name';
import { PollingCard } from './polling-card';
import { formatSince } from '../utils/call-activity';

interface OfflineDevice {
  device: Device;
  name: string;
  users: string[];
}

/** A desk phone nobody uses, or a base still in its box, is not something to fix. */
export function worthShowing(device: Device): boolean {
  if (device.type === 'deskphone') return (device.assignments ?? []).length > 0;
  if (device.type === 'dect_base') return device.offline_since != null;
  return false;
}

/** Longest offline first; never seen online last. */
export function byOfflineSince(a: Device, b: Device): number {
  const at = a.offline_since ? Date.parse(a.offline_since) : Infinity;
  const bt = b.offline_since ? Date.parse(b.offline_since) : Infinity;
  return at - bt;
}

/** How often the device list is re-read. */
const DEVICES_READ_MS = 5 * 60 * 1000;

export class DeviceHealthComponent extends PollingCard {
  protected readonly tagForEvents = 'dialstack-device-health';
  private devices: OfflineDevice[] = [];
  private userNames = new Map<string, string>();
  private onDeviceSelect?: (event: { deviceId: string }) => void;

  setOnDeviceSelect(callback: ((event: { deviceId: string }) => void) | undefined): void {
    this.onDeviceSelect = callback;
    if (this.isInitialized) this.render();
  }

  // No cheap count says when a device goes offline, and the filtered list
  // reads registration for every device of the account, so it is read on a
  // slower clock than the poll: every few minutes, plus Refresh.
  protected override async signature(): Promise<string> {
    return String(Math.floor(this.now.getTime() / DEVICES_READ_MS));
  }

  protected async load(): Promise<void> {
    if (!this.instance) return;
    const [devices] = await Promise.all([
      this.instance.devices.list({
        registration_status: 'not_registered',
        expand: ['users'],
        limit: 100,
      }),
      this.userNames.size === 0 ? this.loadUserNames() : Promise.resolve(),
    ]);
    this.devices = devices
      .filter(worthShowing)
      .sort(byOfflineSince)
      .map((device) => {
        const users = [
          ...new Set(
            (device.assignments ?? [])
              .map((a) => (typeof a.user === 'string' ? a.user : (a.user?.id ?? a.user_id)))
              .map((id) => this.userNames.get(id))
              .filter((n): n is string => !!n)
          ),
        ];
        const name = deviceDisplayName({
          ...device,
          assigned_users: users.map((n) => ({ name: n })),
        }).name;
        return { device, name, users };
      });
  }

  private async loadUserNames(): Promise<void> {
    const users = await this.instance?.users.list({ limit: 100 }).catch(() => []);
    for (const u of users ?? []) this.userNames.set(u.id, u.name || u.email || '');
  }

  protected render(): void {
    const body =
      this.devices.length === 0
        ? `<p class="muted">${this.escapeHtml(this.t('callActivity.deviceHealth.none'))}</p>`
        : `<ul class="list">${this.devices.map((d) => this.renderRow(d)).join('')}</ul>`;
    this.renderCard(
      this.t('callActivity.deviceHealth.title'),
      this.t('callActivity.deviceHealth.description'),
      body
    );
  }

  private renderRow({ device, name, users }: OfflineDevice): string {
    const since = device.offline_since
      ? this.t('callActivity.deviceHealth.offlineSince', {
          duration: formatSince(new Date(device.offline_since), this.now, {
            days: (n) => this.t('callActivity.days', { count: n }),
            hours: (n) => this.t('callActivity.hours', { count: n }),
            minutes: (n) => this.t('callActivity.minutes', { count: n }),
          }),
        })
      : this.t('callActivity.deviceHealth.neverConnected');
    const who =
      users.length > 0 ? users.join(', ') : this.t('callActivity.deviceHealth.unassigned');
    const detail = [device.model, who].filter(Boolean).join(' · ');
    const title = this.onDeviceSelect
      ? `<button type="button" class="link name" data-device="${this.escapeHtml(device.id)}">${this.escapeHtml(name)}</button>`
      : `<span class="name">${this.escapeHtml(name)}</span>`;
    return `
      <li class="${this.itemClass('row')}" part="item device-row" data-testid="offline-device">
        <span class="dot" style="background:var(--ds-color-danger)" aria-hidden="true"></span>
        <span class="what">
          ${title}
          <span class="small muted">${this.escapeHtml(detail)}</span>
        </span>
        <span class="small muted num since" title="${this.escapeHtml(device.offline_since ? new Date(device.offline_since).toLocaleString(this.dateLocale) : '')}">${this.escapeHtml(since)}</span>
      </li>`;
  }

  protected override afterRender(): void {
    super.afterRender();
    for (const b of this.shadowRoot?.querySelectorAll<HTMLButtonElement>('[data-device]') ?? []) {
      b.addEventListener('click', () =>
        this.onDeviceSelect?.({ deviceId: b.dataset.device ?? '' })
      );
    }
  }

  protected override componentStyles(): string {
    return `
      .row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--ds-color-border-subtle); }
      .row:first-child { border-top: 0; padding-top: 0; }
      .row .dot { width: 8px; height: 8px; }
      .what { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .name { font-weight: var(--ds-font-weight-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .since { white-space: nowrap; }
    `;
  }
}

if (typeof window !== 'undefined' && !customElements.get('dialstack-device-health')) {
  customElements.define('dialstack-device-health', DeviceHealthComponent);
}
