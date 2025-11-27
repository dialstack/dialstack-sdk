/**
 * Voicemails Web Component - iOS-style visual voicemail UI
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';
import type {
  VoicemailDisplayOptions,
  VoicemailBehaviorOptions,
  VoicemailRowRenderer,
  VoicemailsClasses,
} from '../core/types';

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
  transcription?: string;
}

/**
 * API response structure (URL-based pagination)
 */
interface VoicemailsResponse {
  object: 'list';
  url: string;
  next_page_url: string | null;
  previous_page_url: string | null;
  data: Voicemail[];
}

/**
 * Voicemails component displays user-specific voicemails with iOS-style UI
 */
export class VoicemailsComponent extends BaseComponent {
  private userId: string | null = null;
  private isLoading: boolean = false;
  private isLoadingMore: boolean = false;
  private error: string | null = null;
  private voicemails: Voicemail[] = [];
  private nextPageUrl: string | null = null;

  // Expandable state
  private expandedId: string | null = null;

  // Confirmation modal state
  private showDeleteConfirm: boolean = false;
  private pendingDeleteId: string | null = null;

  // Audio playback state
  private audioElement: HTMLAudioElement | null = null;
  private isPlaying: boolean = false;
  private currentTime: number = 0;
  private duration: number = 0;
  private progressInterval: number | null = null;

  // Display options
  private displayOptions: Required<VoicemailDisplayOptions> = {
    showDuration: true,
    showTranscription: true,
    showCallbackButton: true,
    showDeleteButton: true,
    showProgressBar: true,
    showTimestamp: true,
  };

  // Behavior options
  private behaviorOptions: Required<VoicemailBehaviorOptions> = {
    autoPlayOnExpand: true,
    confirmBeforeDelete: true,
    markAsReadOnPlay: true,
    allowSeeking: true,
  };

  // Custom row renderer
  private customRowRenderer?: VoicemailRowRenderer;

  // Override classes type for component-specific classes
  protected override classes: VoicemailsClasses = {};

  // Callbacks
  private _onVoicemailSelect?: (event: { voicemailId: string }) => void;
  private _onVoicemailPlay?: (event: { voicemailId: string }) => void;
  private _onVoicemailPause?: (event: { voicemailId: string }) => void;
  private _onVoicemailDelete?: (event: { voicemailId: string }) => void;
  private _onCallBack?: (event: { phoneNumber: string }) => void;
  private _onDeleteRequest?: (voicemailId: string) => Promise<boolean>;

  protected initialize(): void {
    if (this.isInitialized) return;
    this.render();
    if (this.userId) {
      this.loadData();
    }
    this.isInitialized = true;
  }

  /**
   * Clean up resources when component is destroyed
   */
  protected override cleanup(): void {
    this.stopAudio();
    this.hideConfirmModal();
  }

  // ============================================================================
  // Callback Setters
  // ============================================================================

  /**
   * Set callback for voicemail select events
   */
  setOnVoicemailSelect(callback: (event: { voicemailId: string }) => void): void {
    this._onVoicemailSelect = callback;
  }

  /**
   * Set callback for voicemail play events
   */
  setOnVoicemailPlay(callback: (event: { voicemailId: string }) => void): void {
    this._onVoicemailPlay = callback;
  }

  /**
   * Set callback for voicemail pause events
   */
  setOnVoicemailPause(callback: (event: { voicemailId: string }) => void): void {
    this._onVoicemailPause = callback;
  }

  /**
   * Set callback for voicemail delete events
   */
  setOnVoicemailDelete(callback: (event: { voicemailId: string }) => void): void {
    this._onVoicemailDelete = callback;
  }

  /**
   * Set callback for call back events
   */
  setOnCallBack(callback: (event: { phoneNumber: string }) => void): void {
    this._onCallBack = callback;
  }

  /**
   * Set custom delete confirmation handler
   */
  setOnDeleteRequest(callback: (voicemailId: string) => Promise<boolean>): void {
    this._onDeleteRequest = callback;
  }

  // ============================================================================
  // Display & Behavior Options
  // ============================================================================

  /**
   * Set display options (partial override)
   */
  setDisplayOptions(options: VoicemailDisplayOptions): void {
    this.displayOptions = { ...this.displayOptions, ...options };
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Set behavior options (partial override)
   */
  setBehaviorOptions(options: VoicemailBehaviorOptions): void {
    this.behaviorOptions = { ...this.behaviorOptions, ...options };
  }

  /**
   * Set custom row renderer for collapsed voicemail items
   */
  setCustomRowRenderer(renderer: VoicemailRowRenderer | undefined): void {
    this.customRowRenderer = renderer;
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Set custom CSS classes for styling integration
   */
  override setClasses(classes: VoicemailsClasses): void {
    this.classes = { ...this.classes, ...classes };
    if (this.isInitialized) {
      this.render();
    }
  }

  // ============================================================================
  // Data Loading
  // ============================================================================

  /**
   * Load voicemails from API (initial load)
   */
  private async loadData(): Promise<void> {
    if (!this.instance) {
      this.error = this.t('common.error');
      this.render();
      return;
    }

    if (!this.userId) {
      this.error = this.t('voicemails.noUserId');
      this.render();
      return;
    }

    this._onLoaderStart?.({ elementTagName: 'dialstack-voicemails' });
    this.isLoading = true;
    this.error = null;
    this.voicemails = [];
    this.nextPageUrl = null;
    this.render();

    try {
      const params = new URLSearchParams({ limit: '20' });
      const data = await this.fetchComponentData<VoicemailsResponse>(`/v1/users/${this.userId}/voicemails?${params}`);
      this.voicemails = data.data || [];
      this.nextPageUrl = data.next_page_url;

      this.error = null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : this.t('voicemails.loading');
      this.error = errorMessage;
      this._onLoadError?.({ error: errorMessage, elementTagName: 'dialstack-voicemails' });
      this.voicemails = [];
      this.nextPageUrl = null;
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /**
   * Load more voicemails using URL
   */
  private async loadMore(): Promise<void> {
    if (!this.instance || !this.nextPageUrl || this.isLoadingMore) {
      return;
    }

    this.isLoadingMore = true;
    this.updateLoadMoreState();

    try {
      const data = await this.fetchComponentData<VoicemailsResponse>(this.nextPageUrl);

      // Append new results to existing list
      this.voicemails = [...this.voicemails, ...(data.data || [])];
      this.nextPageUrl = data.next_page_url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : this.t('voicemails.loading');
      this._onLoadError?.({ error: errorMessage, elementTagName: 'dialstack-voicemails' });
    } finally {
      this.isLoadingMore = false;
      this.render();
    }
  }

  /**
   * Update load more button state without full re-render
   */
  private updateLoadMoreState(): void {
    if (!this.shadowRoot) return;

    const loadMoreBtn = this.shadowRoot.getElementById('load-more-btn') as HTMLButtonElement;
    if (loadMoreBtn) {
      loadMoreBtn.disabled = this.isLoadingMore;
      loadMoreBtn.textContent = this.isLoadingMore ? this.t('common.loading') : this.t('common.loadMore');
    }
  }

  // ============================================================================
  // Expand/Collapse
  // ============================================================================

  /**
   * Toggle expand/collapse for a voicemail
   * Uses DOM manipulation instead of re-render for smooth CSS transitions
   */
  private toggleExpand(voicemailId: string): void {
    if (!this.shadowRoot) return;

    const clickedItem = this.shadowRoot.querySelector(`.voicemail-item[data-id="${voicemailId}"]`);

    if (this.expandedId === voicemailId) {
      // Collapse current item
      this.stopAudio();
      this.expandedId = null;
      clickedItem?.classList.remove('expanded');
    } else {
      // Collapse previously expanded item
      if (this.expandedId) {
        const prevItem = this.shadowRoot.querySelector(`.voicemail-item[data-id="${this.expandedId}"]`);
        prevItem?.classList.remove('expanded');
        this.stopAudio();
      }

      // Expand new item
      this.expandedId = voicemailId;
      clickedItem?.classList.add('expanded');

      // Fire callback
      this._onVoicemailSelect?.({ voicemailId });

      // Auto-play if enabled
      if (this.behaviorOptions.autoPlayOnExpand) {
        this.togglePlayPause(voicemailId);
      }
    }
  }

  // ============================================================================
  // Audio Playback
  // ============================================================================

  /**
   * Stop current audio playback
   */
  private stopAudio(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement = null;
    }
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
  }

  /**
   * Toggle play/pause
   */
  private togglePlayPause(voicemailId: string): void {
    if (!this.shadowRoot) return;

    const audio = this.shadowRoot.querySelector(`audio[data-id="${voicemailId}"]`) as HTMLAudioElement;
    if (!audio) return;

    if (this.isPlaying && this.audioElement === audio) {
      audio.pause();
      this.isPlaying = false;
      this._onVoicemailPause?.({ voicemailId });
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }
    } else {
      // Stop any other playing audio
      if (this.audioElement && this.audioElement !== audio) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      }

      this.audioElement = audio;
      audio.play();
      this.isPlaying = true;
      this._onVoicemailPlay?.({ voicemailId });
      if (this.behaviorOptions.markAsReadOnPlay) {
        this.markAsRead(voicemailId);
      }

      // Start progress tracking
      this.progressInterval = window.setInterval(() => {
        this.currentTime = audio.currentTime;
        this.duration = audio.duration || 0;
        this.updateProgressUI();
      }, 100);

      // Handle audio end
      audio.onended = () => {
        this.isPlaying = false;
        this.currentTime = 0;
        if (this.progressInterval) {
          clearInterval(this.progressInterval);
          this.progressInterval = null;
        }
        this.updateProgressUI();
      };
    }
    this.updatePlayButtonUI();
  }

  /**
   * Update progress bar UI without full re-render
   */
  private updateProgressUI(): void {
    if (!this.shadowRoot) return;

    const progressFill = this.shadowRoot.querySelector('.progress-fill') as HTMLElement;
    const progressHandle = this.shadowRoot.querySelector('.progress-handle') as HTMLElement;
    const timeCurrent = this.shadowRoot.querySelector('.time-current');
    const timeRemaining = this.shadowRoot.querySelector('.time-remaining');

    if (this.duration > 0) {
      const percent = (this.currentTime / this.duration) * 100;
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (progressHandle) progressHandle.style.left = `${percent}%`;
    }

    if (timeCurrent) {
      timeCurrent.textContent = this.formatTime(this.currentTime);
    }

    if (timeRemaining) {
      const remaining = this.duration - this.currentTime;
      timeRemaining.textContent = `-${this.formatTime(remaining)}`;
    }
  }

  /**
   * Update play button UI without full re-render
   */
  private updatePlayButtonUI(): void {
    if (!this.shadowRoot) return;

    const playBtn = this.shadowRoot.querySelector('.play-btn');
    if (playBtn) {
      playBtn.innerHTML = this.isPlaying ? this.getIcon('pause') : this.getIcon('play');
    }
  }

  /**
   * Handle progress bar seek
   */
  private handleSeek(event: MouseEvent): void {
    if (!this.audioElement || !this.shadowRoot) return;

    const progressBar = this.shadowRoot.querySelector('.progress-bar') as HTMLElement;
    if (!progressBar) return;

    const rect = progressBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const newTime = percent * this.audioElement.duration;

    this.audioElement.currentTime = newTime;
    this.currentTime = newTime;
    this.updateProgressUI();
  }

  /**
   * Start dragging the progress handle
   */
  private startDrag(_event: MouseEvent): void {
    if (!this.audioElement || !this.shadowRoot) return;

    const progressBar = this.shadowRoot.querySelector('.progress-bar') as HTMLElement;
    if (!progressBar) return;

    const onMouseMove = (e: MouseEvent) => {
      const rect = progressBar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = percent * this.audioElement!.duration;

      this.audioElement!.currentTime = newTime;
      this.currentTime = newTime;
      this.updateProgressUI();
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Request deletion of a voicemail (handles confirmation)
   */
  private async requestDelete(voicemailId: string): Promise<void> {
    // Use custom handler if provided
    if (this._onDeleteRequest) {
      const shouldDelete = await this._onDeleteRequest(voicemailId);
      if (shouldDelete) {
        await this.deleteVoicemail(voicemailId);
      }
      return;
    }

    // Use built-in confirmation if enabled
    if (this.behaviorOptions.confirmBeforeDelete) {
      this.showConfirmModal(voicemailId);
      return;
    }

    await this.deleteVoicemail(voicemailId);
  }

  /**
   * Show the custom confirmation modal
   */
  private showConfirmModal(voicemailId: string): void {
    this.pendingDeleteId = voicemailId;
    this.showDeleteConfirm = true;
    this.updateConfirmModalVisibility();
  }

  /**
   * Hide the confirmation modal
   */
  private hideConfirmModal(): void {
    this.showDeleteConfirm = false;
    this.pendingDeleteId = null;
    this.updateConfirmModalVisibility();
  }

  /**
   * Update modal visibility without full re-render
   */
  private updateConfirmModalVisibility(): void {
    if (!this.shadowRoot) return;

    const modal = this.shadowRoot.querySelector('.confirm-modal-overlay') as HTMLElement;
    if (modal) {
      modal.classList.toggle('visible', this.showDeleteConfirm);
      modal.setAttribute('aria-hidden', (!this.showDeleteConfirm).toString());
    }
  }

  /**
   * Handle confirm button click in modal
   */
  private async handleConfirmDelete(): Promise<void> {
    if (this.pendingDeleteId) {
      await this.deleteVoicemail(this.pendingDeleteId);
    }
    this.hideConfirmModal();
  }

  /**
   * Delete voicemail (actual deletion)
   */
  private async deleteVoicemail(voicemailId: string): Promise<void> {
    if (!this.instance || !this.userId) return;

    try {
      await this.instance.fetchApi(`/v1/users/${this.userId}/voicemails/${voicemailId}`, {
        method: 'DELETE',
      });

      // Fire callback
      this._onVoicemailDelete?.({ voicemailId });

      // Remove from local state
      this.voicemails = this.voicemails.filter((vm) => vm.id !== voicemailId);
      this.expandedId = null;
      this.stopAudio();
      this.render();
    } catch (err) {
      console.error('Failed to delete voicemail:', err);
    }
  }

  /**
   * Mark voicemail as read
   */
  private async markAsRead(voicemailId: string): Promise<void> {
    if (!this.instance || !this.userId) return;

    const voicemail = this.voicemails.find((vm) => vm.id === voicemailId);
    if (!voicemail || voicemail.is_read) return;

    voicemail.is_read = true;

    // Update DOM without re-render
    if (this.shadowRoot) {
      const row = this.shadowRoot.querySelector(`[data-id="${voicemailId}"]`);
      if (row) {
        const dot = row.querySelector('.unread-dot');
        if (dot) dot.classList.add('hidden');
        const name = row.querySelector('.caller-name');
        if (name) name.classList.remove('unread');
      }
    }

    try {
      await this.instance.fetchApi(`/v1/users/${this.userId}/voicemails/${voicemailId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_read: true }),
      });
    } catch (err) {
      console.error('Failed to mark voicemail as read:', err);
    }
  }

  // ============================================================================
  // Formatting Helpers
  // ============================================================================

  /**
   * Format time in seconds to "M:SS" format
   */
  private formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Format timestamp in short format
   */
  private formatDateShort(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      const dateLocale = this.formatting.dateLocale || 'en-US';

      return date.toLocaleDateString(dateLocale, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return timestamp;
    }
  }

  /**
   * Format timestamp in long format
   */
  private formatDateLong(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      const dateLocale = this.formatting.dateLocale || 'en-US';
      const use24Hour = this.formatting.use24HourTime ?? false;
      const showTimezone = this.formatting.showTimezone ?? true;

      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: !use24Hour,
      };

      if (showTimezone) {
        options.timeZoneName = 'short';
      }

      return date.toLocaleString(dateLocale, options);
    } catch {
      return timestamp;
    }
  }

  /**
   * Format phone number for display
   */
  private formatPhoneNumber(phone: string): string {
    if (!phone) return '';

    try {
      const defaultCountry = (this.formatting.defaultCountry || 'US') as CountryCode;
      const parsed: PhoneNumber | undefined = parsePhoneNumber(phone, defaultCountry);
      if (parsed) {
        return parsed.formatNational();
      }
    } catch {
      // If parsing fails, return original
    }

    return phone;
  }

  /**
   * Get icon SVG by name
   */
  private getIcon(name: keyof typeof this.icons): string {
    return this.icons[name];
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  /**
   * Render the component
   */
  protected render(): void {
    if (!this.shadowRoot) return;

    const styles = this.applyAppearanceStyles();

    this.shadowRoot.innerHTML = `
      <style>
        ${styles}

        :host {
          display: block;
        }

        .container {
          background: var(--ds-color-background);
          color: var(--ds-color-text);
          font-size: var(--ds-font-size-base);
          line-height: var(--ds-line-height);
        }

        .loading,
        .error,
        .empty {
          padding: var(--ds-spacing-xl);
          text-align: center;
          background: var(--ds-color-surface-subtle);
          border-radius: var(--ds-border-radius);
        }

        .error {
          background: color-mix(in srgb, var(--ds-color-danger) 10%, transparent);
          color: var(--ds-color-danger);
        }

        .spinner {
          display: inline-block;
          width: var(--ds-spinner-size);
          height: var(--ds-spinner-size);
          color: var(--ds-color-primary);
          animation: spin 0.8s linear infinite;
        }

        .spinner svg {
          width: 100%;
          height: 100%;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* No-seek progress bar */
        .progress-row.no-seek .progress-bar {
          cursor: default;
        }

        /* Voicemail List */
        .voicemail-list {
          display: flex;
          flex-direction: column;
        }

        /* Voicemail Item Container */
        .voicemail-item {
          border-bottom: 1px solid var(--ds-color-border);
          cursor: pointer;
        }

        .voicemail-item.expanded {
          cursor: default;
        }

        .voicemail-item:last-child {
          border-bottom: none;
        }

        .voicemail-item:hover {
          background: var(--ds-color-surface-subtle);
        }

        /* Collapsed Row - hidden when expanded */
        .voicemail-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          padding: var(--ds-spacing-md) var(--ds-spacing-lg);
        }

        .voicemail-item.expanded .voicemail-row {
          display: none;
        }

        /* Unread dot */
        .unread-dot {
          width: var(--ds-unread-indicator-size);
          height: var(--ds-unread-indicator-size);
          border-radius: var(--ds-border-radius-round);
          background: var(--ds-color-primary);
          margin-right: var(--ds-spacing-md);
          flex-shrink: 0;
        }

        .unread-dot.hidden {
          visibility: hidden;
        }

        /* Row content - collapsed */
        .row-content {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: var(--ds-spacing-xs) var(--ds-spacing-lg);
        }

        .caller-name {
          font-size: var(--ds-font-size-large);
          font-weight: var(--ds-font-weight-normal);
          color: var(--ds-color-text);
          grid-column: 1;
          grid-row: 1;
        }

        .caller-name.unread {
          font-weight: var(--ds-font-weight-bold);
        }

        .phone-number-collapsed {
          font-size: var(--ds-font-size-base);
          color: var(--ds-color-text-secondary);
          grid-column: 1;
          grid-row: 2;
        }

        .timestamp {
          font-size: var(--ds-font-size-base);
          color: var(--ds-color-text-secondary);
          grid-column: 2;
          grid-row: 1;
          text-align: right;
        }

        .duration {
          font-size: var(--ds-font-size-small);
          color: var(--ds-color-text-secondary);
          grid-column: 2;
          grid-row: 2;
          text-align: right;
        }

        /* Chevron */
        .chevron {
          display: flex;
          align-items: center;
          justify-content: center;
          width: var(--ds-icon-size-small);
          height: var(--ds-icon-size-small);
          color: var(--ds-color-text-secondary);
          margin-left: var(--ds-spacing-sm);
          transition: transform var(--ds-transition-duration) ease;
        }

        .chevron svg {
          width: 100%;
          height: 100%;
        }

        .voicemail-item.expanded .chevron {
          transform: rotate(90deg);
        }

        /* Expanded detail section - replaces collapsed row */
        .voicemail-detail {
          display: none;
          padding: var(--ds-spacing-lg);
        }

        .voicemail-item.expanded .voicemail-detail {
          display: block;
        }

        /* Detail rows */
        .detail-caller {
          font-size: var(--ds-font-size-xlarge);
          font-weight: var(--ds-font-weight-bold);
          color: var(--ds-color-text);
          margin-bottom: var(--ds-spacing-xs);
        }

        .detail-phone {
          font-size: var(--ds-font-size-base);
          color: var(--ds-color-text-secondary);
          margin-bottom: var(--ds-spacing-xs);
        }

        .detail-date {
          font-size: var(--ds-font-size-base);
          color: var(--ds-color-text-secondary);
          margin-bottom: var(--ds-spacing-lg);
        }

        /* Progress bar row */
        .progress-row {
          display: flex;
          align-items: center;
          gap: var(--ds-spacing-sm);
          margin-bottom: var(--ds-spacing-md);
        }

        .progress-bar {
          flex: 1;
          height: var(--ds-player-progress-height);
          background: var(--ds-color-border);
          border-radius: var(--ds-border-radius-small);
          cursor: pointer;
          position: relative;
        }

        .progress-fill {
          height: 100%;
          background: var(--ds-color-primary);
          border-radius: var(--ds-border-radius-small);
          width: 0%;
        }

        .progress-handle {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: var(--ds-player-progress-handle-size);
          height: var(--ds-player-progress-handle-size);
          background: var(--ds-color-primary);
          border-radius: var(--ds-border-radius-round);
          cursor: grab;
          box-shadow: 0 1px 3px var(--ds-color-border);
        }

        .progress-handle:active {
          cursor: grabbing;
        }

        .time-current,
        .time-remaining {
          font-size: var(--ds-font-size-small);
          color: var(--ds-color-text-secondary);
          min-width: var(--ds-time-display-width);
        }

        .time-current {
          text-align: right;
        }

        .time-remaining {
          text-align: left;
        }

        /* Controls row */
        .controls-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--ds-spacing-lg);
        }

        .play-btn {
          width: var(--ds-player-button-size);
          height: var(--ds-player-button-size);
          border-radius: var(--ds-border-radius-round);
          border: none;
          background: var(--ds-color-primary);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: opacity var(--ds-transition-duration);
        }

        .play-btn svg {
          width: var(--ds-icon-size);
          height: var(--ds-icon-size);
        }

        .play-btn:hover {
          opacity: 0.85;
        }

        /* Action buttons */
        .action-buttons {
          display: flex;
          gap: var(--ds-spacing-sm);
        }

        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--ds-spacing-xs);
          padding: var(--ds-spacing-sm) var(--ds-spacing-md);
          border-radius: var(--ds-border-radius);
          border: none;
          font-size: var(--ds-font-size-base);
          font-weight: var(--ds-font-weight-medium);
          cursor: pointer;
          transition: opacity var(--ds-transition-duration);
        }

        .action-btn:hover {
          opacity: 0.85;
        }

        .action-btn svg {
          width: var(--ds-icon-size-small);
          height: var(--ds-icon-size-small);
        }

        .action-btn.call {
          background: var(--ds-color-primary);
          color: white;
        }

        .action-btn.delete {
          background: var(--ds-color-danger);
          color: white;
        }

        /* Transcription */
        .transcription {
          padding: var(--ds-spacing-md);
          background: var(--ds-color-surface-subtle);
          border-radius: var(--ds-border-radius);
        }

        .transcription-header {
          font-size: var(--ds-font-size-small);
          font-weight: var(--ds-font-weight-bold);
          color: var(--ds-color-text-secondary);
          margin-bottom: var(--ds-spacing-sm);
        }

        .transcription-text {
          font-size: var(--ds-font-size-base);
          line-height: var(--ds-line-height);
          color: var(--ds-color-text);
        }

        /* Hidden audio element */
        audio {
          display: none;
        }

        /* Confirmation Modal */
        .confirm-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          opacity: 0;
          visibility: hidden;
          transition: opacity var(--ds-transition-duration), visibility var(--ds-transition-duration);
        }

        .confirm-modal-overlay.visible {
          opacity: 1;
          visibility: visible;
        }

        .confirm-modal {
          background: var(--ds-color-background);
          border-radius: var(--ds-border-radius-large);
          padding: var(--ds-spacing-xl);
          max-width: 400px;
          width: 90%;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
          transform: scale(0.95);
          transition: transform var(--ds-transition-duration);
        }

        .confirm-modal-overlay.visible .confirm-modal {
          transform: scale(1);
        }

        .confirm-modal-title {
          font-size: var(--ds-font-size-large);
          font-weight: var(--ds-font-weight-bold);
          color: var(--ds-color-text);
          margin-bottom: var(--ds-spacing-sm);
        }

        .confirm-modal-message {
          font-size: var(--ds-font-size-base);
          color: var(--ds-color-text-secondary);
          margin-bottom: var(--ds-spacing-xl);
          line-height: var(--ds-line-height);
        }

        .confirm-modal-buttons {
          display: flex;
          justify-content: flex-end;
          gap: var(--ds-spacing-sm);
        }

        .confirm-modal-btn {
          padding: var(--ds-spacing-sm) var(--ds-spacing-lg);
          border-radius: var(--ds-border-radius);
          font-size: var(--ds-font-size-base);
          font-weight: var(--ds-font-weight-medium);
          cursor: pointer;
          transition: opacity var(--ds-transition-duration);
          border: none;
        }

        .confirm-modal-btn:hover {
          opacity: 0.85;
        }

        .confirm-modal-btn.cancel {
          background: var(--ds-color-surface-subtle);
          color: var(--ds-color-text);
          border: 1px solid var(--ds-color-border);
        }

        .confirm-modal-btn.confirm {
          background: var(--ds-color-danger);
          color: white;
        }
      </style>

      <div class="container ${this.getClassNames()}" part="container" role="region" aria-label="${this.t('voicemails.title')}">
        ${this.renderContent()}
      </div>

      <!-- Confirmation Modal -->
      <div class="confirm-modal-overlay ${this.showDeleteConfirm ? 'visible' : ''}"
           part="confirm-modal-overlay"
           role="dialog"
           aria-modal="true"
           aria-hidden="${!this.showDeleteConfirm}"
           aria-labelledby="confirm-modal-title">
        <div class="confirm-modal" part="confirm-modal">
          <div class="confirm-modal-title" id="confirm-modal-title" part="confirm-modal-title">
            ${this.t('voicemails.deleteTitle')}
          </div>
          <div class="confirm-modal-message" part="confirm-modal-message">
            ${this.t('voicemails.deleteConfirm')}
          </div>
          <div class="confirm-modal-buttons" part="confirm-modal-buttons">
            <button class="confirm-modal-btn cancel" part="confirm-modal-cancel" data-action="cancel-delete">
              ${this.t('common.cancel')}
            </button>
            <button class="confirm-modal-btn confirm" part="confirm-modal-confirm" data-action="confirm-delete">
              ${this.t('common.delete')}
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Render content based on state
   */
  private renderContent(): string {
    if (this.isLoading) {
      return `
        <div class="loading ${this.classes.loading || ''}" part="loading" role="status" aria-live="polite">
          <slot name="loading">
            <div class="spinner" part="spinner" aria-hidden="true">${this.getIcon('spinner')}</div>
            <p>${this.t('voicemails.loading')}</p>
          </slot>
        </div>
      `;
    }

    if (this.error) {
      return `
        <div class="error ${this.classes.error || ''}" part="error" role="alert">
          <slot name="error">
            <p>${this.error}</p>
          </slot>
        </div>
      `;
    }

    if (!this.userId) {
      return `
        <div class="empty ${this.classes.empty || ''}" part="empty" role="status">
          <slot name="empty">
            <p>${this.t('voicemails.noUserId')}</p>
          </slot>
        </div>
      `;
    }

    if (this.voicemails.length === 0) {
      return `
        <div class="empty ${this.classes.empty || ''}" part="empty" role="status">
          <slot name="empty">
            <p>${this.t('voicemails.empty')}</p>
          </slot>
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
      .map((vm) => {
        const isExpanded = this.expandedId === vm.id;
        const isUnread = !vm.is_read;
        const callerName = vm.from_name || 'Unknown';

        // Use custom row renderer if provided
        const customRow = this.customRowRenderer ? this.customRowRenderer(vm) : null;

        // Build item classes
        const itemClasses = ['voicemail-item'];
        if (isExpanded) itemClasses.push('expanded');
        if (this.classes.item) itemClasses.push(this.classes.item);
        if (isExpanded && this.classes.itemExpanded) itemClasses.push(this.classes.itemExpanded);
        if (isUnread && this.classes.itemUnread) itemClasses.push(this.classes.itemUnread);

        return `
          <div class="${itemClasses.join(' ')}"
               part="voicemail-item ${isExpanded ? 'voicemail-item-expanded' : ''} ${isUnread ? 'voicemail-item-unread' : ''}"
               data-id="${vm.id}"
               role="listitem"
               tabindex="0"
               aria-expanded="${isExpanded}"
               aria-label="${callerName}, ${this.formatPhoneNumber(vm.from_number)}, ${this.formatDateShort(vm.created_at)}">
            <div class="voicemail-row" part="voicemail-row">
              ${customRow !== null ? customRow : `
                <span class="unread-dot ${isUnread ? '' : 'hidden'}" part="unread-indicator" aria-hidden="true"></span>
                <div class="row-content" part="row-content">
                  <span class="caller-name ${isUnread ? 'unread' : ''}" part="caller-name">${callerName}</span>
                  <span class="phone-number-collapsed" part="phone-number">${this.formatPhoneNumber(vm.from_number)}</span>
                  ${this.displayOptions.showTimestamp ? `<span class="timestamp" part="timestamp">${this.formatDateShort(vm.created_at)}</span>` : ''}
                  ${this.displayOptions.showDuration ? `<span class="duration" part="duration">${this.formatTime(vm.duration_seconds)}</span>` : ''}
                </div>
                <span class="chevron" part="chevron" aria-hidden="true">${this.getIcon('chevronRight')}</span>
              `}
            </div>
            ${this.renderExpandedDetail(vm)}
          </div>
        `;
      })
      .join('');

    return `
      <div class="voicemail-list ${this.classes.list || ''}" part="voicemail-list" role="list" aria-label="${this.t('voicemails.title')}">
        ${items}
      </div>
      ${this.nextPageUrl ? `
      <div class="load-more-container" part="load-more-container">
        <button
          id="load-more-btn"
          class="load-more-btn"
          part="load-more-button"
          aria-label="${this.t('common.loadMore')}"
          ${this.isLoadingMore ? 'disabled' : ''}>
          ${this.isLoadingMore ? this.t('common.loading') : this.t('common.loadMore')}
        </button>
      </div>
      ` : ''}
    `;
  }

  /**
   * Render expanded voicemail detail
   */
  private renderExpandedDetail(vm: Voicemail): string {
    const callerName = vm.from_name || 'Unknown';
    const isCurrentlyPlaying = this.isPlaying && this.audioElement?.getAttribute('data-id') === vm.id;
    const progressPercent = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
    const canSeek = this.behaviorOptions.allowSeeking;

    return `
      <div class="voicemail-detail" part="voicemail-detail" data-detail-id="${vm.id}">
        <audio data-id="${vm.id}" preload="auto">
          <source src="${vm.audio_url}" type="audio/${vm.format || 'wav'}">
        </audio>

        <!-- Row 1: Caller ID -->
        <div class="detail-caller" part="detail-caller">${callerName}</div>

        <!-- Row 2: Phone number -->
        <div class="detail-phone" part="detail-phone">${this.formatPhoneNumber(vm.from_number)}</div>

        <!-- Row 3: Timestamp -->
        ${this.displayOptions.showTimestamp ? `<div class="detail-date" part="detail-date">${this.formatDateLong(vm.created_at)}</div>` : ''}

        <!-- Row 4: Progress bar -->
        ${this.displayOptions.showProgressBar ? `
        <div class="progress-row ${canSeek ? '' : 'no-seek'}" part="progress-row"
             role="slider"
             aria-label="${this.t('voicemails.progress')}"
             aria-valuemin="0"
             aria-valuemax="${this.duration || vm.duration_seconds}"
             aria-valuenow="${this.currentTime}">
          <span class="time-current" part="time-current">${this.formatTime(this.currentTime)}</span>
          <div class="progress-bar" part="progress-bar" data-action="${canSeek ? 'seek' : ''}">
            <div class="progress-fill" part="progress-fill" style="width: ${progressPercent}%"></div>
            ${canSeek ? `<div class="progress-handle" part="progress-handle" style="left: ${progressPercent}%"></div>` : ''}
          </div>
          <span class="time-remaining" part="time-remaining">-${this.formatTime(this.duration - this.currentTime || vm.duration_seconds)}</span>
        </div>
        ` : ''}

        <!-- Row 5: Play button (left) + Action buttons (right) -->
        <div class="controls-row ${this.classes.player || ''}" part="controls-row">
          <button class="play-btn" part="play-button"
                  data-action="play"
                  data-id="${vm.id}"
                  aria-label="${isCurrentlyPlaying ? this.t('common.pause') : this.t('common.play')}">
            ${isCurrentlyPlaying ? this.getIcon('pause') : this.getIcon('play')}
          </button>
          <div class="action-buttons ${this.classes.actions || ''}" part="action-buttons">
            ${this.displayOptions.showCallbackButton ? `
            <button class="action-btn call" part="callback-button"
                    data-action="call"
                    data-number="${vm.from_number}"
                    aria-label="${this.t('common.call')}">
              ${this.getIcon('phone')}
              ${this.t('common.call')}
            </button>
            ` : ''}
            ${this.displayOptions.showDeleteButton ? `
            <button class="action-btn delete" part="delete-button"
                    data-action="delete"
                    data-id="${vm.id}"
                    aria-label="${this.t('common.delete')}">
              ${this.getIcon('trash')}
              ${this.t('common.delete')}
            </button>
            ` : ''}
          </div>
        </div>

        <!-- Row 6: Transcription -->
        ${this.displayOptions.showTranscription && vm.transcription ? `
        <div class="transcription" part="transcription">
          <div class="transcription-header" part="transcription-header">${this.t('voicemails.transcription')}</div>
          <div class="transcription-text" part="transcription-text">${vm.transcription}</div>
        </div>
        ` : ''}
      </div>
    `;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    if (!this.shadowRoot) return;

    // Load more button
    const loadMoreBtn = this.shadowRoot.getElementById('load-more-btn');
    loadMoreBtn?.addEventListener('click', () => this.loadMore());

    // Item click to expand/collapse (works on both collapsed row and expanded detail header)
    const items = this.shadowRoot.querySelectorAll('.voicemail-item');
    items.forEach((item) => {
      // Click handler
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Don't toggle if clicking on buttons or interactive elements
        if (target.closest('button') || target.closest('.progress-row') || target.closest('.transcription')) return;

        const id = item.getAttribute('data-id');
        // Only expand, don't collapse when clicking on already expanded item
        if (id && this.expandedId !== id) this.toggleExpand(id);
      });

      // Keyboard handler
      item.addEventListener('keydown', (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') {
          const id = item.getAttribute('data-id');
          if (id && this.expandedId !== id) {
            e.preventDefault();
            this.toggleExpand(id);
          }
        }
      });
    });

    // Play button
    const playBtns = this.shadowRoot.querySelectorAll('[data-action="play"]');
    playBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (id) this.togglePlayPause(id);
      });
    });

    // Progress bar seek (click anywhere on progress row)
    const progressRows = this.shadowRoot.querySelectorAll('.progress-row');
    progressRows.forEach((row) => {
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleSeek(e as MouseEvent);
      });
    });

    // Progress handle drag
    const progressHandles = this.shadowRoot.querySelectorAll('.progress-handle');
    progressHandles.forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.startDrag(e as MouseEvent);
      });
    });

    // Delete button
    const deleteBtns = this.shadowRoot.querySelectorAll('[data-action="delete"]');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (id) {
          this.requestDelete(id);
        }
      });
    });

    // Call button
    const callBtns = this.shadowRoot.querySelectorAll('[data-action="call"]');
    callBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const phoneNumber = btn.getAttribute('data-number');
        if (phoneNumber) {
          this._onCallBack?.({ phoneNumber });
        }
      });
    });

    // Confirmation modal - Cancel button
    const cancelBtn = this.shadowRoot.querySelector('[data-action="cancel-delete"]');
    cancelBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideConfirmModal();
    });

    // Confirmation modal - Confirm button
    const confirmBtn = this.shadowRoot.querySelector('[data-action="confirm-delete"]');
    confirmBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleConfirmDelete();
    });

    // Confirmation modal - Click outside to close
    const modalOverlay = this.shadowRoot.querySelector('.confirm-modal-overlay');
    modalOverlay?.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        this.hideConfirmModal();
      }
    });

    // Confirmation modal - Escape key to close
    modalOverlay?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        this.hideConfirmModal();
      }
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
