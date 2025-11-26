/**
 * Voicemails Web Component
 */

import { parsePhoneNumber, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';

/**
 * Voicemail data structure from API
 */
interface Voicemail {
  id: string;
  from_name: string;
  from_number: string;
  created_at: string;
  duration_seconds: number;
  is_read: boolean;
  audio_url: string;
  format?: string;
}

/**
 * API response structure
 */
interface VoicemailsResponse {
  voicemails: Voicemail[];
}

/**
 * Voicemails component displays user-specific voicemails with audio playback
 */
export class VoicemailsComponent extends BaseComponent {
  private userId: string | null = null;
  private isLoading: boolean = false;
  private error: string | null = null;
  private voicemails: Voicemail[] = [];

  protected initialize(): void {
    if (this.isInitialized) return;
    this.render();
    if (this.userId) {
      this.loadData();
    }
    this.isInitialized = true;
  }

  /**
   * Load voicemails from API
   */
  private async loadData(): Promise<void> {
    if (!this.instance) {
      this.error = 'Component not initialized with instance';
      this.render();
      return;
    }

    if (!this.userId) {
      this.error = 'User ID is required';
      this.render();
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const data = await this.fetchComponentData<VoicemailsResponse>(`/v1/users/${this.userId}/voicemails`);
      this.voicemails = data.voicemails || [];
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load voicemails';
      this.voicemails = [];
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /**
   * Mark voicemail as read
   */
  private async markAsRead(voicemailId: string): Promise<void> {
    if (!this.instance || !this.userId) return;

    // Update local state first
    const voicemail = this.voicemails.find((vm) => vm.id === voicemailId);
    if (!voicemail || voicemail.is_read) return; // Already read, nothing to do

    voicemail.is_read = true;

    // Update DOM without re-rendering (to avoid destroying playing audio)
    if (this.shadowRoot) {
      const item = this.shadowRoot.querySelector(`[data-voicemail-id="${voicemailId}"].voicemail-item`);
      if (item) {
        item.classList.remove('unread');
        // Update the status badge
        const statusBadge = item.querySelector('.badge-unread');
        if (statusBadge) {
          statusBadge.classList.remove('badge-unread');
          statusBadge.classList.add('badge-read');
          statusBadge.textContent = 'Read';
        }
      }
    }

    // Send API request in background
    try {
      await this.instance.fetchApi(`/v1/users/${this.userId}/voicemails/${voicemailId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_read: true }),
      });
    } catch (err) {
      // Silent failure - log error but don't block audio playback
      console.error('Failed to mark voicemail as read:', err);
    }
  }

  /**
   * Get initials from name for avatar
   */
  private getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  /**
   * Format timestamp to localized date/time string (matches call-logs)
   */
  private formatDate(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      });
    } catch {
      return timestamp;
    }
  }

  /**
   * Format phone number for display using libphonenumber-js
   */
  private formatPhoneNumber(phone: string): string {
    if (!phone) return '';

    try {
      const parsed: PhoneNumber | undefined = parsePhoneNumber(phone, 'US');
      if (parsed) {
        return parsed.formatNational();
      }
    } catch {
      // If parsing fails, return original
    }

    return phone;
  }

  /**
   * Format duration in seconds to "Xm Ys" format
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  /**
   * Get avatar color based on name hash
   */
  private getAvatarColor(name: string): string {
    const colors = [
      '#6772E5',
      '#10B981',
      '#F59E0B',
      '#EF4444',
      '#8B5CF6',
      '#EC4899',
      '#14B8A6',
      '#F97316',
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  /**
   * Render the component
   */
  protected render(): void {
    if (!this.shadowRoot) return;

    const styles = this.applyAppearanceStyles();

    this.shadowRoot.innerHTML = `
      <style>
        ${styles}

        .container {
          background: var(--ds-color-background);
          color: var(--ds-color-text);
        }

        .loading,
        .error,
        .empty {
          padding: calc(var(--ds-spacing-unit) * 3);
          text-align: center;
          background: rgba(0, 0, 0, 0.02);
          border-radius: var(--ds-border-radius);
        }

        .error {
          background: rgba(229, 72, 77, 0.1);
          color: var(--ds-color-danger);
        }

        .spinner {
          display: inline-block;
          width: 24px;
          height: 24px;
          border: 3px solid rgba(0, 0, 0, 0.1);
          border-top-color: var(--ds-color-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .voicemail-list {
          display: flex;
          flex-direction: column;
          gap: calc(var(--ds-spacing-unit) * 1.5);
        }

        .voicemail-item {
          display: flex;
          align-items: flex-start;
          gap: calc(var(--ds-spacing-unit) * 1.5);
          padding: calc(var(--ds-spacing-unit) * 2);
          background: rgba(0, 0, 0, 0.02);
          border-radius: var(--ds-border-radius);
          transition: background 0.2s;
        }

        .voicemail-item:hover {
          background: rgba(0, 0, 0, 0.04);
        }

        .voicemail-item.unread {
          background: rgba(103, 114, 229, 0.05);
          border-left: 3px solid var(--ds-color-primary);
        }

        .voicemail-item.unread:hover {
          background: rgba(103, 114, 229, 0.08);
        }

        .avatar {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .voicemail-content {
          flex-grow: 1;
          min-width: 0;
        }

        .voicemail-header {
          display: flex;
          align-items: center;
          gap: calc(var(--ds-spacing-unit));
          margin-bottom: calc(var(--ds-spacing-unit) * 0.5);
        }

        .caller-name {
          font-weight: 600;
          font-size: 0.9375rem;
          color: var(--ds-color-text);
        }

        .voicemail-item.unread .caller-name {
          font-weight: 700;
        }

        .timestamp {
          font-size: 0.8125rem;
          color: rgba(0, 0, 0, 0.5);
        }

        .caller-number {
          font-size: 0.8125rem;
          color: rgba(0, 0, 0, 0.6);
          margin-bottom: calc(var(--ds-spacing-unit) * 0.5);
        }

        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .badge-duration {
          background: rgba(0, 0, 0, 0.05);
          color: var(--ds-color-text);
          margin-right: calc(var(--ds-spacing-unit) * 0.5);
        }

        .badge-unread {
          background: rgba(103, 114, 229, 0.1);
          color: #6772E5;
        }

        .badge-read {
          background: rgba(0, 0, 0, 0.05);
          color: rgba(0, 0, 0, 0.5);
        }

        .badges {
          margin-bottom: calc(var(--ds-spacing-unit));
        }

        audio {
          width: 300px;
          height: 32px;
          outline: none;
        }

        audio::-webkit-media-controls-panel {
          background-color: rgba(0, 0, 0, 0.05);
        }
      </style>

      <div class="container">
        ${this.renderContent()}
      </div>
    `;

    // Attach event listeners after render
    this.attachEventListeners();
  }

  /**
   * Render content based on state
   */
  private renderContent(): string {
    if (this.isLoading) {
      return `
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading voicemails...</p>
        </div>
      `;
    }

    if (this.error) {
      return `
        <div class="error">
          <p><strong>Error:</strong> ${this.error}</p>
        </div>
      `;
    }

    if (!this.userId) {
      return `
        <div class="empty">
          <p>Please set a user ID to load voicemails</p>
        </div>
      `;
    }

    if (this.voicemails.length === 0) {
      return `
        <div class="empty">
          <p>No voicemails found</p>
        </div>
      `;
    }

    return this.renderVoicemailList();
  }

  /**
   * Render the voicemail list
   */
  private renderVoicemailList(): string {
    const items = this.voicemails
      .map(
        (vm) => `
      <div class="voicemail-item ${vm.is_read ? '' : 'unread'}" data-voicemail-id="${vm.id}">
        <div class="avatar" style="background: ${this.getAvatarColor(vm.from_name)}">
          ${this.getInitials(vm.from_name)}
        </div>
        <div class="voicemail-content">
          <div class="voicemail-header">
            <span class="caller-name">${vm.from_name}</span>
            <span class="timestamp">${this.formatDate(vm.created_at)}</span>
          </div>
          <div class="caller-number">${this.formatPhoneNumber(vm.from_number)}</div>
          <div class="badges">
            <span class="badge badge-duration">${this.formatDuration(vm.duration_seconds)}</span>
            <span class="badge ${vm.is_read ? 'badge-read' : 'badge-unread'}">${vm.is_read ? 'Read' : 'Unread'}</span>
          </div>
          <audio controls preload="metadata" data-voicemail-id="${vm.id}">
            <source src="${vm.audio_url}" type="audio/${vm.format || 'wav'}">
            Your browser does not support audio playback.
          </audio>
        </div>
      </div>
    `
      )
      .join('');

    return `<div class="voicemail-list">${items}</div>`;
  }

  /**
   * Attach event listeners to audio elements
   */
  private attachEventListeners(): void {
    if (!this.shadowRoot) return;

    const audioElements = this.shadowRoot.querySelectorAll('audio');
    audioElements.forEach((audio) => {
      audio.addEventListener('play', () => {
        const voicemailId = audio.getAttribute('data-voicemail-id');
        if (voicemailId) {
          this.markAsRead(voicemailId);
        }
      });
    });
  }

  /**
   * Set user ID and reload data (for React integration)
   */
  setUserId(userId: string): void {
    this.userId = userId;
    if (this.isInitialized) {
      this.loadData();
    }
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-voicemails')) {
  customElements.define('dialstack-voicemails', VoicemailsComponent);
}
