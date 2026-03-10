/**
 * Hardware step helper — owns all state and logic for device provisioning.
 * Supports drag-and-drop device assignment to team members.
 */

import type { ProvisionedDevice, DECTBase, DECTHandset, OnboardingEndpoint } from '../../types';
import { DRAG_HANDLE_SVG, DESK_PHONE_SVG, CORDLESS_SVG } from './icons';
import type { OnboardingHost } from './host';

/** Unified device reference for drag-and-drop (desk phone or DECT handset). */
interface AssignableDevice {
  id: string;
  type: 'deskphone' | 'dect-handset';
  label: string;
  typeLabel: string;
  /** For DECT handsets, the parent base ID */
  baseId?: string;
}

export class HardwareStepHelper {
  // Hardware state
  devices: ProvisionedDevice[] = [];
  dectBases: DECTBase[] = [];
  dectHandsets: Map<string, DECTHandset[]> = new Map();
  userEndpointMap: Map<string, OnboardingEndpoint[]> = new Map();

  // Drag-and-drop assignment state (local until submit)
  private deviceAssignments: Map<string, string> = new Map(); // deviceId → userId
  private selectedDeviceId: string | null = null;
  private hwSubmitting = false;

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
      this.initAssignmentsFromData();
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
  // Assignment Helpers
  // ============================================================================

  /** Build reverse map: endpointId → userId */
  private getEndpointToUserMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const [userId, eps] of this.userEndpointMap.entries()) {
      for (const ep of eps) {
        map.set(ep.id, userId);
      }
    }
    return map;
  }

  /** Pre-populate assignments from existing API data (resume case). */
  private initAssignmentsFromData(): void {
    const endpointToUser = this.getEndpointToUserMap();

    // Desk phones
    for (const dev of this.devices) {
      const lines = dev.lines ?? [];
      const assignedLine = lines.find((l) => l.endpoint_id && endpointToUser.has(l.endpoint_id));
      if (assignedLine) {
        this.deviceAssignments.set(dev.id, endpointToUser.get(assignedLine.endpoint_id!)!);
      }
    }

    // DECT handsets
    for (const [, handsets] of this.dectHandsets.entries()) {
      for (const hs of handsets) {
        const exts = hs.extensions ?? [];
        const ext = exts.find((e) => endpointToUser.has(e.endpoint_id));
        if (ext) {
          this.deviceAssignments.set(hs.id, endpointToUser.get(ext.endpoint_id)!);
        }
      }
    }
  }

  /** Get all assignable devices (desk phones + DECT handsets). */
  private getAllAssignableDevices(): AssignableDevice[] {
    const t = (key: string): string => this.host.t(key);
    const devices: AssignableDevice[] = [];

    for (const dev of this.devices) {
      const vendor = dev.vendor ? dev.vendor.charAt(0).toUpperCase() + dev.vendor.slice(1) : '';
      const label = `${vendor}${dev.model ? ' ' + dev.model : ''}`.trim() || dev.mac_address;
      devices.push({
        id: dev.id,
        type: 'deskphone',
        label,
        typeLabel: t('accountOnboarding.hardware.deskPhone'),
      });
    }

    for (const [baseId, handsets] of this.dectHandsets.entries()) {
      for (const hs of handsets) {
        devices.push({
          id: hs.id,
          type: 'dect-handset',
          label: hs.display_name ?? hs.ipei,
          typeLabel: t('accountOnboarding.hardware.cordless'),
          baseId,
        });
      }
    }

    return devices;
  }

  private getUnassignedDevices(): AssignableDevice[] {
    return this.getAllAssignableDevices().filter((d) => !this.deviceAssignments.has(d.id));
  }

  private getDeviceForUser(userId: string): AssignableDevice | undefined {
    const all = this.getAllAssignableDevices();
    for (const [deviceId, assignedUserId] of this.deviceAssignments.entries()) {
      if (assignedUserId === userId) {
        return all.find((d) => d.id === deviceId);
      }
    }
    return undefined;
  }

  /** Assign a device to a user, replacing any existing assignment for that user. */
  private assignDeviceToUser(deviceId: string, userId: string): void {
    for (const [existingDeviceId, existingUserId] of this.deviceAssignments.entries()) {
      if (existingUserId === userId) {
        this.deviceAssignments.delete(existingDeviceId);
        break;
      }
    }
    this.deviceAssignments.set(deviceId, userId);
    this.host.render();
  }

  private get allAssigned(): boolean {
    const totalDevices = this.getAllAssignableDevices().length;
    return totalDevices > 0 && this.deviceAssignments.size === totalDevices;
  }

  // ============================================================================
  // Click Handler
  // ============================================================================

  handleAction(action: string, actionEl: HTMLElement): boolean {
    switch (action) {
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
      case 'hw-unassign': {
        const unassignUserId = actionEl.dataset.userId;
        if (unassignUserId) {
          // Find which device is assigned to this user and remove assignment
          for (const [deviceId, assignedUserId] of this.deviceAssignments.entries()) {
            if (assignedUserId === unassignUserId) {
              this.deviceAssignments.delete(deviceId);
              break;
            }
          }
          this.selectedDeviceId = null;
          this.host.render();
        }
        return true;
      }
      case 'hw-submit-assignments':
        this.handleSubmitAssignments();
        return true;
      default:
        return false;
    }
  }

  // ============================================================================
  // Save / Remove Handlers
  // ============================================================================

  private async handleSubmitAssignments(): Promise<void> {
    if (!this.host.instance || this.hwSubmitting) return;
    this.hwSubmitting = true;
    this.hwActionError = null;
    this.host.render();

    try {
      // Find all assignable devices for lookup
      const allDevices = this.getAllAssignableDevices();

      for (const [deviceId, userId] of this.deviceAssignments.entries()) {
        const device = allDevices.find((d) => d.id === deviceId);
        if (!device) continue;

        const endpoint = await this.ensureEndpoint(userId);

        if (device.type === 'deskphone') {
          // Check if device already has a line for this endpoint
          const dev = this.devices.find((d) => d.id === deviceId);
          const lines = dev?.lines ?? [];
          const existingLine = lines.find((l) => l.endpoint_id === endpoint.id);
          if (!existingLine) {
            await this.host.instance.createDeviceLine(deviceId, {
              endpoint_id: endpoint.id,
            });
          }
        } else if (device.type === 'dect-handset' && device.baseId) {
          // Check if handset already has an extension for this endpoint
          const handsets = this.dectHandsets.get(device.baseId) ?? [];
          const hs = handsets.find((h) => h.id === deviceId);
          const exts = hs?.extensions ?? [];
          const existingExt = exts.find((e) => e.endpoint_id === endpoint.id);
          if (!existingExt) {
            await this.host.instance.createDECTExtension(device.baseId, deviceId, {
              endpoint_id: endpoint.id,
            });
          }
        }
      }

      this.selectedDeviceId = null;
      this.host.navigateToStep('complete');
    } catch (err) {
      this.hwActionError = err instanceof Error ? err.message : String(err);
    } finally {
      this.hwSubmitting = false;
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
      // Remove assignment if any
      this.deviceAssignments.delete(deviceId);
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

    // Drag-and-drop: device cards
    this.host.shadowRoot.querySelectorAll<HTMLElement>('.hw-device-card').forEach((card) => {
      // Skip stacked (background) cards
      if (card.classList.contains('hw-device-card--stacked')) return;

      card.addEventListener('dragstart', (e) => {
        const deviceId = card.dataset.deviceId ?? '';

        e.dataTransfer?.setData('text/plain', deviceId);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      // Click-to-assign: toggle selection
      card.addEventListener('click', () => {
        const deviceId = card.dataset.deviceId ?? '';
        this.selectedDeviceId = this.selectedDeviceId === deviceId ? null : deviceId;
        this.host.render();
      });
    });

    // Drag-and-drop + click-to-assign: drop zones
    this.host.shadowRoot.querySelectorAll<HTMLElement>('.hw-drop-zone').forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const deviceId = e.dataTransfer?.getData('text/plain');
        const userId = zone.dataset.userId;
        if (deviceId && userId) {
          this.assignDeviceToUser(deviceId, userId);
        }
      });

      // Click-to-assign: clicking a drop zone when a device is selected
      zone.addEventListener('click', () => {
        const userId = zone.dataset.userId;
        if (this.selectedDeviceId && userId) {
          this.assignDeviceToUser(this.selectedDeviceId, userId);
          this.selectedDeviceId = null;
          this.host.render();
        }
      });
    });
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

    const allDevices = this.getAllAssignableDevices();
    const hasDevices = allDevices.length > 0;
    const unassigned = this.getUnassignedDevices();
    const allAssigned = this.allAssigned;

    // Available Devices section
    let availableSection: string;
    if (hasDevices) {
      let cardsOrMessage: string;
      if (allAssigned) {
        cardsOrMessage = `<div class="hw-all-assigned">${t('accountOnboarding.hardware.allAssigned')}</div>`;
      } else {
        // Group unassigned devices by type for stacked rendering
        const groups = new Map<string, AssignableDevice[]>();
        for (const d of unassigned) {
          const group = groups.get(d.label) ?? [];
          group.push(d);
          groups.set(d.label, group);
        }
        const MAX_VISUAL_LAYERS = 3;
        const stacks = [...groups.values()]
          .map((group) => {
            // Only render up to MAX_VISUAL_LAYERS cards visually; top card is always the real one
            const visualCount = Math.min(group.length, MAX_VISUAL_LAYERS);
            const visualSlice = group.slice(group.length - visualCount);
            const cards = visualSlice
              .map((d, i) => this.renderDeviceCard(d, i, visualCount))
              .join('');
            const count = group.length;
            const badge = count > 1 ? `<span class="hw-stack-count">${count}</span>` : '';
            const extraPx = (visualCount - 1) * 2.5;
            return `<div class="hw-device-stack" style="margin-right:${extraPx}px;margin-bottom:${extraPx}px">${badge}${cards}</div>`;
          })
          .join('');
        cardsOrMessage = `<div class="hw-device-cards">${stacks}</div>`;
      }
      availableSection = `
        <div class="hw-available-devices">
          <div class="hw-available-devices-label">${t('accountOnboarding.hardware.availableDevices')}</div>
          ${cardsOrMessage}
        </div>`;
    } else {
      availableSection = `
        <div class="placeholder">
          <div class="placeholder-text">${t('accountOnboarding.hardware.noDevices')}</div>
        </div>`;
    }

    // Team members table
    const teamRows = this.host.users.map((u) => this.renderTeamMemberRow(u)).join('');

    const teamTable = `
      <table class="hw-team-table">
        <thead>
          <tr>
            <th>Full name</th>
            <th>Extension</th>
            <th>Assigned Device</th>
          </tr>
        </thead>
        <tbody>
          ${teamRows}
        </tbody>
      </table>`;

    // Action error
    const actionErrorHtml = this.hwActionError
      ? `<div class="inline-alert error" style="margin-bottom:var(--ds-layout-spacing-sm)">${this.host.escapeHtml(this.hwActionError)}</div>`
      : '';

    // Footer with assignment-aware button
    const footerButton = this.renderAssignmentFooter();

    return `
      <div class="card ${this.host.classes.stepHardware || ''}" part="step-hardware">
        <h2 class="section-title">${t('accountOnboarding.hardware.title')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.hardware.subtitle')}</p>
        ${actionErrorHtml}
        ${availableSection}
        ${hasDevices ? teamTable : ''}
      </div>
      ${footerButton}
    `;
  }

  private renderDeviceCard(device: AssignableDevice, stackIndex = 0, stackSize = 1): string {
    const icon = device.type === 'deskphone' ? DESK_PHONE_SVG : CORDLESS_SVG;
    // Cards behind the top card are offset and lowered in z-order
    const isTop = stackIndex === stackSize - 1;
    const offset = (stackSize - 1 - stackIndex) * 2.5;
    const zIndex = stackIndex;
    const stackStyle =
      stackSize > 1
        ? ` style="transform:translateX(${offset}px) translateY(${offset}px);z-index:${zIndex}"`
        : '';
    const stackClass = !isTop && stackSize > 1 ? ' hw-device-card--stacked' : '';
    const selectedClass =
      isTop && device.id === this.selectedDeviceId ? ' hw-device-card--selected' : '';
    return `
      <div class="hw-device-card${stackClass}${selectedClass}" draggable="true" data-device-id="${this.host.escapeHtml(device.id)}"${stackStyle}>
        <span class="hw-device-card__handle">${DRAG_HANDLE_SVG}</span>
        <span class="hw-device-card__icon">${icon}</span>
        <span class="hw-device-card__text">
          <span class="hw-device-card__label">${this.host.escapeHtml(device.label)}</span>
          <span class="hw-device-card__type">${this.host.escapeHtml(device.typeLabel)}</span>
        </span>
      </div>`;
  }

  private renderTeamMemberRow(user: {
    id: string;
    name?: string | null;
    email?: string | null;
  }): string {
    const t = (key: string): string => this.host.t(key);
    const displayName = user.name ?? user.email ?? user.id;
    const initials = (user.name ?? user.email ?? '?')
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('');
    const ext = this.host.getExtensionForUser(user.id);
    const extNumber = ext?.number ?? '—';
    const assignedDevice = this.getDeviceForUser(user.id);

    let deviceCell: string;
    if (assignedDevice) {
      deviceCell = `
        <span class="hw-device-badge-chip">
          ${this.host.escapeHtml(assignedDevice.label)}
          <button class="hw-device-badge-chip__remove" data-action="hw-unassign" data-user-id="${this.host.escapeHtml(user.id)}" title="${t('accountOnboarding.hardware.unassign')}">&times;</button>
        </span>`;
    } else {
      const selectable = this.selectedDeviceId ? ' hw-drop-zone--selectable' : '';
      const hint = this.selectedDeviceId
        ? t('accountOnboarding.hardware.clickToAssign')
        : t('accountOnboarding.hardware.dragDropHint');
      deviceCell = `
        <div class="hw-drop-zone${selectable}" data-user-id="${this.host.escapeHtml(user.id)}">
          <span class="hw-drop-zone__placeholder">${hint}</span>
        </div>`;
    }

    return `
      <tr>
        <td>
          <div class="hw-team-name">
            <span class="hw-team-avatar">${this.host.escapeHtml(initials)}</span>
            <span class="hw-team-name-text">${this.host.escapeHtml(displayName)}</span>
          </div>
        </td>
        <td>${this.host.escapeHtml(extNumber)}</td>
        <td>${deviceCell}</td>
      </tr>`;
  }

  private renderAssignmentFooter(): string {
    const t = (key: string): string => this.host.t(key);
    const allDevices = this.getAllAssignableDevices();
    const hasDevices = allDevices.length > 0;
    const allAssigned = this.allAssigned;

    if (hasDevices && allAssigned) {
      return `
        <div class="footer-bar">
          <button class="btn-ghost" data-action="back">${t('accountOnboarding.nav.back')}</button>
          <button class="btn btn-primary" data-action="hw-submit-assignments"${this.hwSubmitting ? ' disabled' : ''}>
            ${this.hwSubmitting ? t('accountOnboarding.hardware.submitting') : t('accountOnboarding.hardware.assignAndComplete')}
          </button>
        </div>`;
    }

    // Default footer — skip/next when no devices or not all assigned
    return this.host.renderStepFooter();
  }
}
