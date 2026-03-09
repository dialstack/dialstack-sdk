/**
 * Hardware step helper — owns all state and logic for device provisioning.
 */

import type { ProvisionedDevice, DECTBase, DECTHandset, OnboardingEndpoint } from '../../types';
import { normalizeMac } from '../../utils/mac';
import type { OnboardingHost } from './host';

export class HardwareStepHelper {
  // Hardware state
  devices: ProvisionedDevice[] = [];
  dectBases: DECTBase[] = [];
  dectHandsets: Map<string, DECTHandset[]> = new Map();
  userEndpointMap: Map<string, OnboardingEndpoint[]> = new Map();

  // Inline editing state
  private hwEditingRowKey: string | null = null;
  private hwEditMac = '';
  private hwEditIsDectBase = false;
  private hwEditIpei = '';
  private hwEditUserId = '';
  private hwEditSaving = false;
  private hwEditError: string | null = null;
  private hwActionError: string | null = null;

  constructor(private host: OnboardingHost) {}

  // ============================================================================
  // Data Loading
  // ============================================================================

  async loadHardwareData(): Promise<void> {
    if (!this.host.instance) return;

    try {
      const endpointMap = new Map<string, OnboardingEndpoint[]>();
      const handsetMap = new Map<string, DECTHandset[]>();
      await Promise.all([
        ...this.host.users.map(async (u) => {
          const eps = await this.host.instance!.listEndpoints(u.id);
          endpointMap.set(u.id, eps);
        }),
        ...this.dectBases.map(async (b) => {
          const hs = await this.host.instance!.listDECTHandsets(b.id);
          handsetMap.set(b.id, hs);
        }),
      ]);
      this.userEndpointMap = endpointMap;
      this.dectHandsets = handsetMap;
      await this.hydrateDeviceLines();
      this.host.render();
    } catch (err) {
      console.warn('[dialstack] Failed to load hardware data:', err);
    }
  }

  private async hydrateDeviceLines(): Promise<void> {
    if (!this.host.instance || this.devices.length === 0) return;

    await Promise.all(
      this.devices.map(async (dev) => {
        dev.lines = await this.host.instance!.listDeviceLines(dev.id);
      })
    );
  }

  private async ensureEndpoint(userId: string): Promise<OnboardingEndpoint> {
    if (!this.host.instance) throw new Error('Not initialized');

    const existing = this.userEndpointMap.get(userId) ?? [];
    if (existing.length > 0) return existing[0]!;

    const endpoint = await this.host.instance.createEndpoint(userId);
    const updated = [...existing, endpoint];
    this.userEndpointMap.set(userId, updated);
    return endpoint;
  }

  // ============================================================================
  // Click Handler
  // ============================================================================

  handleAction(action: string, actionEl: HTMLElement): boolean {
    switch (action) {
      case 'hw-add-new':
        this.hwEditingRowKey = 'new';
        this.hwEditMac = '';
        this.hwEditIsDectBase = false;
        this.hwEditIpei = '';
        this.hwEditUserId = '';
        this.hwEditError = null;
        this.host.render();
        return true;
      case 'hw-add-handset': {
        const hsBaseId = actionEl.dataset.baseId ?? '';
        this.hwEditingRowKey = `new-handset:${hsBaseId}`;
        this.hwEditIpei = '';
        this.hwEditUserId = '';
        this.hwEditError = null;
        this.host.render();
        return true;
      }
      case 'hw-save-row':
        this.handleSaveHwRow();
        return true;
      case 'hw-cancel-row':
        this.hwEditingRowKey = null;
        this.hwEditMac = '';
        this.hwEditIsDectBase = false;
        this.hwEditIpei = '';
        this.hwEditUserId = '';
        this.hwEditError = null;
        this.host.render();
        return true;
      case 'hw-remove-base': {
        const delBaseId = actionEl.dataset.baseId ?? '';
        if (delBaseId) {
          this.handleRemoveDectBase(delBaseId);
        }
        return true;
      }
      case 'remove-device': {
        const deviceId = actionEl.dataset.deviceId;
        const deviceType = actionEl.dataset.deviceType ?? 'deskphone';
        const rmUserId = actionEl.dataset.userId ?? '';
        const rmBaseId = actionEl.dataset.baseId ?? '';
        if (deviceId) {
          this.handleRemoveDevice(deviceId, deviceType, rmUserId, rmBaseId);
        }
        return true;
      }
      default:
        return false;
    }
  }

  // ============================================================================
  // Save / Remove Handlers
  // ============================================================================

  private async handleSaveHwRow(): Promise<void> {
    if (!this.host.instance || this.hwEditSaving) return;
    this.hwEditError = null;

    if (this.hwEditingRowKey === 'new') {
      const normalized = normalizeMac(this.hwEditMac);
      if (!normalized) {
        this.hwEditError = this.host.t('accountOnboarding.hardware.invalidMac');
        this.host.render();
        return;
      }

      if (!this.hwEditUserId) {
        this.hwEditError = this.host.t('accountOnboarding.hardware.selectUserRequired');
        this.host.render();
        return;
      }

      if (this.hwEditIsDectBase) {
        const ipeiRaw = this.hwEditIpei;
        if (normalizeMac(ipeiRaw)) {
          this.hwEditError = this.host.t('accountOnboarding.hardware.ipeiNotMac');
          this.host.render();
          return;
        }
        const ipeiHex = ipeiRaw.replace(/[^a-fA-F0-9]/g, '');
        if (!ipeiHex) {
          this.hwEditError = this.host.t('accountOnboarding.hardware.invalidIpei');
          this.host.render();
          return;
        }

        this.hwEditSaving = true;
        this.host.render();

        try {
          await this.host.instance.createDECTBase({ mac_address: normalized });
          this.dectBases = await this.host.instance.listDECTBases();
          const newBase = this.dectBases.find(
            (b) => b.mac_address.replace(/:/g, '') === normalized.replace(/:/g, '')
          );
          if (!newBase) throw new Error('Failed to find newly created DECT base');

          await this.host.instance.createDECTHandset(newBase.id, { ipei: ipeiHex });
          const handsets = await this.host.instance.listDECTHandsets(newBase.id);
          this.dectHandsets.set(newBase.id, handsets);

          const newHandset = handsets.find(
            (h) => h.ipei.replace(/[^a-fA-F0-9]/g, '').toLowerCase() === ipeiHex.toLowerCase()
          );
          if (newHandset) {
            const endpoint = await this.ensureEndpoint(this.hwEditUserId);
            await this.host.instance.createDECTExtension(newBase.id, newHandset.id, {
              endpoint_id: endpoint.id,
            });
            const refreshed = await this.host.instance.listDECTHandsets(newBase.id);
            this.dectHandsets.set(newBase.id, refreshed);
          }

          this.hwEditingRowKey = `new-handset:${newBase.id}`;
          this.hwEditIpei = '';
          this.hwEditUserId = '';
          this.hwEditMac = '';
          this.hwEditIsDectBase = false;
          this.hwEditError = null;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('409') || msg.toLowerCase().includes('already')) {
            this.hwEditError = this.host.t('accountOnboarding.hardware.duplicateMac');
          } else {
            this.hwEditError = msg;
          }
        } finally {
          this.hwEditSaving = false;
          this.host.render();
        }
      } else {
        // Desk phone flow
        this.hwEditSaving = true;
        this.host.render();

        try {
          await this.host.instance.createDevice({ mac_address: normalized });
          this.devices = await this.host.instance.listDevices();
          await this.hydrateDeviceLines();
          const newDev = this.devices.find(
            (d) =>
              d.mac_address.toLowerCase().replace(/:/g, '') ===
              normalized.toLowerCase().replace(/:/g, '')
          );

          if (!newDev) {
            this.hwEditError = this.host.t('accountOnboarding.hardware.deviceNotFound');
            this.hwEditSaving = false;
            this.host.render();
            return;
          }

          const endpoint = await this.ensureEndpoint(this.hwEditUserId);
          await this.host.instance.createDeviceLine(newDev.id, { endpoint_id: endpoint.id });
          this.devices = await this.host.instance.listDevices();
          await this.hydrateDeviceLines();

          this.hwEditingRowKey = null;
          this.hwEditMac = '';
          this.hwEditUserId = '';
          this.hwEditError = null;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('409') || msg.toLowerCase().includes('already')) {
            this.hwEditError = this.host.t('accountOnboarding.hardware.duplicateMac');
          } else {
            this.hwEditError = msg;
          }
        } finally {
          this.hwEditSaving = false;
          this.host.render();
        }
      }
    } else if (this.hwEditingRowKey?.startsWith('new-handset:')) {
      const baseId = this.hwEditingRowKey.replace('new-handset:', '');

      const ipeiRaw = this.hwEditIpei;
      if (normalizeMac(ipeiRaw)) {
        this.hwEditError = this.host.t('accountOnboarding.hardware.ipeiNotMac');
        this.host.render();
        return;
      }
      const ipeiHex = ipeiRaw.replace(/[^a-fA-F0-9]/g, '');
      if (!ipeiHex) {
        this.hwEditError = this.host.t('accountOnboarding.hardware.invalidIpei');
        this.host.render();
        return;
      }

      if (!this.hwEditUserId) {
        this.hwEditError = this.host.t('accountOnboarding.hardware.selectUserRequired');
        this.host.render();
        return;
      }

      this.hwEditSaving = true;
      this.host.render();

      try {
        await this.host.instance!.createDECTHandset(baseId, { ipei: ipeiHex });
        const handsets = await this.host.instance!.listDECTHandsets(baseId);
        this.dectHandsets.set(baseId, handsets);

        const newHandset = handsets.find(
          (h) => h.ipei.replace(/[^a-fA-F0-9]/g, '').toLowerCase() === ipeiHex.toLowerCase()
        );
        if (newHandset) {
          const endpoint = await this.ensureEndpoint(this.hwEditUserId);
          await this.host.instance!.createDECTExtension(baseId, newHandset.id, {
            endpoint_id: endpoint.id,
          });
          const refreshed = await this.host.instance!.listDECTHandsets(baseId);
          this.dectHandsets.set(baseId, refreshed);
        }

        this.hwEditIpei = '';
        this.hwEditUserId = '';
        this.hwEditError = null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('409') || msg.toLowerCase().includes('already')) {
          this.hwEditError = this.host.t('accountOnboarding.hardware.duplicateMac');
        } else {
          this.hwEditError = msg;
        }
      } finally {
        this.hwEditSaving = false;
        this.host.render();
      }
    }
  }

  private async handleRemoveDectBase(baseId: string): Promise<void> {
    if (!this.host.instance) return;
    this.hwActionError = null;
    try {
      await this.host.instance.deleteDECTBase(baseId);
      this.dectBases = this.dectBases.filter((b) => b.id !== baseId);
      this.dectHandsets.delete(baseId);
      if (this.hwEditingRowKey === `new-handset:${baseId}`) {
        this.hwEditingRowKey = null;
        this.hwEditIpei = '';
        this.hwEditUserId = '';
        this.hwEditError = null;
      }
      await this.loadHardwareData();
    } catch {
      this.hwActionError = this.host.t('accountOnboarding.hardware.removeBaseFailed');
      this.host.render();
    }
  }

  private async handleRemoveDevice(
    deviceId: string,
    deviceType: string,
    _userId: string,
    baseId: string
  ): Promise<void> {
    if (!this.host.instance) return;
    this.hwActionError = null;

    try {
      if (deviceType === 'deskphone') {
        await this.host.instance.deleteDevice(deviceId);
        this.devices = await this.host.instance.listDevices();
        await this.hydrateDeviceLines();
      } else {
        await this.host.instance.deleteDECTHandset(baseId, deviceId);
        const refreshed = await this.host.instance.listDECTHandsets(baseId);
        this.dectHandsets.set(baseId, refreshed);
      }
    } catch (err) {
      this.hwActionError = err instanceof Error ? err.message : String(err);
    }
    this.host.render();
  }

  // ============================================================================
  // Input Listeners
  // ============================================================================

  attachInputListeners(): void {
    if (!this.host.shadowRoot) return;

    const bindInput = (id: string, setter: (val: string) => void): void => {
      const el = this.host.shadowRoot?.querySelector<HTMLInputElement | HTMLSelectElement>(
        `#${id}`
      );
      if (el) {
        el.addEventListener('input', (e) => setter((e.target as HTMLInputElement).value));
        el.addEventListener('change', (e) => setter((e.target as HTMLSelectElement).value));
      }
    };

    bindInput('hw-edit-mac', (v) => {
      this.hwEditMac = v;
    });
    bindInput('hw-edit-ipei', (v) => {
      this.hwEditIpei = v;
    });
    bindInput('hw-edit-user', (v) => {
      this.hwEditUserId = v;
    });

    const dectCheckbox =
      this.host.shadowRoot.querySelector<HTMLInputElement>('#hw-edit-dect-checkbox');
    if (dectCheckbox) {
      dectCheckbox.addEventListener('change', () => {
        this.hwEditIsDectBase = dectCheckbox.checked;
        this.host.render();
      });
    }

    const macInput = this.host.shadowRoot.querySelector<HTMLInputElement>('#hw-edit-mac');
    if (macInput) {
      macInput.addEventListener('blur', () => {
        const normalized = normalizeMac(macInput.value);
        if (normalized) {
          this.hwEditMac = normalized;
          macInput.value = normalized;
        }
      });
    }
  }

  // ============================================================================
  // Renderers
  // ============================================================================

  renderHardwareStep(): string {
    const t = (key: string): string => this.host.t(key);

    if (this.host.users.length === 0) {
      return `
        <div class="card ${this.host.classes.stepHardware || ''}" part="step-hardware">
          <h2 class="section-title">${t('accountOnboarding.hardware.title')}</h2>
          <p class="section-subtitle">${t('accountOnboarding.hardware.noUsers')}</p>
        </div>
        ${this.host.renderStepFooter()}
      `;
    }

    // Build a reverse map: endpointId → userId
    const endpointToUser = new Map<string, string>();
    for (const [userId, eps] of this.userEndpointMap.entries()) {
      for (const ep of eps) {
        endpointToUser.set(ep.id, userId);
      }
    }

    const getUserName = (userId: string): string => {
      const u = this.host.users.find((u) => u.id === userId);
      return u?.name ?? u?.email ?? userId;
    };

    // Desk phone rows
    const deskPhoneRows = this.devices
      .map((dev) => {
        const lines = dev.lines ?? [];
        const assignedLine = lines.find((l) => l.endpoint_id && endpointToUser.has(l.endpoint_id));
        const userId = assignedLine ? endpointToUser.get(assignedLine.endpoint_id!)! : null;
        const vendor = dev.vendor ? dev.vendor.charAt(0).toUpperCase() + dev.vendor.slice(1) : '';
        const vendorLabel = `${vendor}${dev.model ? ' ' + dev.model : ''}`;
        return `
        <div class="hw-device-row">
          <div class="hw-device-row__info">
            <span class="hw-device-badge">${this.host.escapeHtml(vendorLabel)}</span>
            <span class="hw-device-mac">${this.host.escapeHtml(dev.mac_address)}</span>
            ${userId ? `<span class="hw-device-user">&rarr; ${this.host.escapeHtml(getUserName(userId))}</span>` : ''}
          </div>
          <div class="hw-device-row__actions">
            <button class="btn-danger-ghost" data-action="remove-device" data-device-id="${this.host.escapeHtml(dev.id)}" data-device-type="deskphone" data-user-id="${this.host.escapeHtml(userId ?? '')}" data-base-id="">${t('accountOnboarding.hardware.removeDevice')}</button>
          </div>
        </div>`;
      })
      .join('');

    // DECT base groups
    const dectGroupRows = this.dectBases
      .map((base) => {
        const handsets = this.dectHandsets.get(base.id) ?? [];
        const count = handsets.length;
        const countLabel = `${count} ${count === 1 ? t('accountOnboarding.hardware.handset') : t('accountOnboarding.hardware.handsets')}`;

        const handsetRows = handsets
          .map((hs) => {
            const exts = hs.extensions ?? [];
            const ext = exts.find((e) => endpointToUser.has(e.endpoint_id));
            const hsUserId = ext ? endpointToUser.get(ext.endpoint_id)! : null;
            return `
            <div class="hw-device-row hw-device-row--handset">
              <div class="hw-device-row__info">
                <span class="hw-device-mac">${this.host.escapeHtml(hs.ipei)}</span>
                ${hsUserId ? `<span class="hw-device-user">&rarr; ${this.host.escapeHtml(getUserName(hsUserId))}</span>` : ''}
              </div>
              <div class="hw-device-row__actions">
                <button class="btn-danger-ghost" data-action="remove-device" data-device-id="${this.host.escapeHtml(hs.id)}" data-device-type="dect-handset" data-user-id="${this.host.escapeHtml(hsUserId ?? '')}" data-base-id="${this.host.escapeHtml(base.id)}">${t('accountOnboarding.hardware.removeDevice')}</button>
              </div>
            </div>`;
          })
          .join('');

        const inlineHandsetForm =
          this.hwEditingRowKey === `new-handset:${base.id}`
            ? this.renderInlineHandsetForm(base.id)
            : '';

        return `
        <div class="hw-dect-group">
          <div class="hw-device-row hw-device-row--base">
            <div class="hw-device-row__info">
              <span class="hw-device-mac">${this.host.escapeHtml(base.mac_address)}</span>
              <span class="hw-device-badge">${t('accountOnboarding.hardware.dectBase')} &mdash; ${countLabel}</span>
            </div>
            <div class="hw-device-row__actions">
              <button class="btn-link" data-action="hw-add-handset" data-base-id="${this.host.escapeHtml(base.id)}">${t('accountOnboarding.hardware.addHandsetButton')}</button>
              <button class="btn-danger-ghost" data-action="hw-remove-base" data-base-id="${this.host.escapeHtml(base.id)}">${t('accountOnboarding.hardware.removeDevice')}</button>
            </div>
          </div>
          ${handsetRows}
          ${inlineHandsetForm}
        </div>`;
      })
      .join('');

    // Add device row / inline form
    let addDeviceRow: string;
    if (this.hwEditingRowKey === 'new') {
      addDeviceRow = this.renderInlineNewDeviceForm();
    } else if (!this.hwEditingRowKey || this.hwEditingRowKey.startsWith('new-handset:')) {
      addDeviceRow = `
        <div class="hw-device-row hw-device-row--add">
          <button class="btn-link" data-action="hw-add-new">${t('accountOnboarding.hardware.addDeviceButton')}</button>
        </div>`;
    } else {
      addDeviceRow = '';
    }

    const actionErrorHtml = this.hwActionError
      ? `<div class="inline-alert error" style="margin-bottom:var(--ds-layout-spacing-sm)">${this.host.escapeHtml(this.hwActionError)}</div>`
      : '';

    return `
      <div class="card ${this.host.classes.stepHardware || ''}" part="step-hardware">
        <h2 class="section-title">${t('accountOnboarding.hardware.title')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.hardware.subtitle')}</p>
        ${actionErrorHtml}
        <div class="hw-device-list">
          ${deskPhoneRows}
          ${dectGroupRows}
          ${addDeviceRow}
        </div>
      </div>
      ${this.host.renderStepFooter()}
    `;
  }

  private renderInlineNewDeviceForm(): string {
    const t = (key: string): string => this.host.t(key);
    const userOptionsHtml = this.host.users
      .map(
        (u) =>
          `<option value="${this.host.escapeHtml(u.id)}"${this.hwEditUserId === u.id ? ' selected' : ''}>${this.host.escapeHtml(u.name ?? u.email ?? u.id)}</option>`
      )
      .join('');

    const ipeiField = this.hwEditIsDectBase
      ? `<div class="form-group">
          <label class="form-label" for="hw-edit-ipei">${t('accountOnboarding.hardware.ipeiLabel')}</label>
          <input class="form-input" type="text" id="hw-edit-ipei"
            value="${this.host.escapeHtml(this.hwEditIpei)}"
            placeholder="${t('accountOnboarding.hardware.ipeiPlaceholder')}" />
        </div>`
      : '';

    const errorHtml = this.hwEditError
      ? `<div class="inline-alert error">${this.host.escapeHtml(this.hwEditError)}</div>`
      : '';

    return `
      <div class="hw-device-row hw-device-row--editing">
        <div class="hw-inline-form">
          <div class="form-group">
            <label class="form-label" for="hw-edit-mac">${t('accountOnboarding.hardware.macLabel')}</label>
            <input class="form-input" type="text" id="hw-edit-mac"
              value="${this.host.escapeHtml(this.hwEditMac)}"
              placeholder="${t('accountOnboarding.hardware.macPlaceholder')}" />
          </div>
          <div class="form-group">
            <label class="form-check-label">
              <input type="checkbox" id="hw-edit-dect-checkbox"
                ${this.hwEditIsDectBase ? 'checked' : ''} />
              ${t('accountOnboarding.hardware.isDectBase')}
            </label>
          </div>
          ${ipeiField}
          <div class="form-group">
            <label class="form-label" for="hw-edit-user">${t('accountOnboarding.hardware.userLabel')}</label>
            <select class="form-input" id="hw-edit-user">
              <option value="">${t('accountOnboarding.hardware.selectUser')}</option>
              ${userOptionsHtml}
            </select>
          </div>
          <button class="btn btn-secondary btn-sm" data-action="hw-save-row"${this.hwEditSaving ? ' disabled' : ''}>
            ${this.hwEditSaving ? t('accountOnboarding.hardware.saving') : t('accountOnboarding.hardware.save')}
          </button>
          <button class="btn btn-secondary btn-sm" data-action="hw-cancel-row"${this.hwEditSaving ? ' disabled' : ''}>
            ${t('accountOnboarding.hardware.cancel')}
          </button>
        </div>
        ${errorHtml}
      </div>`;
  }

  private renderInlineHandsetForm(baseId: string): string {
    const t = (key: string): string => this.host.t(key);
    const userOptionsHtml = this.host.users
      .map(
        (u) =>
          `<option value="${this.host.escapeHtml(u.id)}"${this.hwEditUserId === u.id ? ' selected' : ''}>${this.host.escapeHtml(u.name ?? u.email ?? u.id)}</option>`
      )
      .join('');

    const errorHtml = this.hwEditError
      ? `<div class="inline-alert error">${this.host.escapeHtml(this.hwEditError)}</div>`
      : '';

    return `
      <div class="hw-device-row hw-device-row--editing" data-base-id="${this.host.escapeHtml(baseId)}">
        <div class="hw-inline-form">
          <div class="form-group">
            <label class="form-label" for="hw-edit-ipei">${t('accountOnboarding.hardware.ipeiLabel')}</label>
            <input class="form-input" type="text" id="hw-edit-ipei"
              value="${this.host.escapeHtml(this.hwEditIpei)}"
              placeholder="${t('accountOnboarding.hardware.ipeiPlaceholder')}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="hw-edit-user">${t('accountOnboarding.hardware.userLabel')}</label>
            <select class="form-input" id="hw-edit-user">
              <option value="">${t('accountOnboarding.hardware.selectUser')}</option>
              ${userOptionsHtml}
            </select>
          </div>
          <button class="btn btn-secondary btn-sm" data-action="hw-save-row"${this.hwEditSaving ? ' disabled' : ''}>
            ${this.hwEditSaving ? t('accountOnboarding.hardware.saving') : t('accountOnboarding.hardware.save')}
          </button>
          <button class="btn btn-secondary btn-sm" data-action="hw-cancel-row"${this.hwEditSaving ? ' disabled' : ''}>
            ${t('accountOnboarding.hardware.cancel')}
          </button>
        </div>
        ${errorHtml}
      </div>`;
  }
}
