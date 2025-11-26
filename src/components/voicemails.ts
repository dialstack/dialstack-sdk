/**
 * Voicemails Web Component - iOS-style visual voicemail UI
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
  transcription?: string;
}

/**
 * API response structure
 */
interface VoicemailsResponse {
  voicemails: Voicemail[];
}

/**
 * Voicemails component displays user-specific voicemails with iOS-style UI
 */
export class VoicemailsComponent extends BaseComponent {
  private userId: string | null = null;
  private isLoading: boolean = false;
  private error: string | null = null;
  private voicemails: Voicemail[] = [];

  // Expandable state
  private expandedId: string | null = null;

  // Audio playback state
  private audioElement: HTMLAudioElement | null = null;
  private isPlaying: boolean = false;
  private currentTime: number = 0;
  private duration: number = 0;
  private progressInterval: number | null = null;

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

      // Auto-play
      this.togglePlayPause(voicemailId);
    }
  }

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
      this.markAsRead(voicemailId);

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
      playBtn.innerHTML = this.isPlaying ? this.getPauseIcon() : this.getPlayIcon();
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

  /**
   * Delete voicemail
   */
  private async deleteVoicemail(voicemailId: string): Promise<void> {
    if (!this.instance || !this.userId) return;

    try {
      await this.instance.fetchApi(`/v1/users/${this.userId}/voicemails/${voicemailId}`, {
        method: 'DELETE',
      });

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

  /**
   * Format time in seconds to "M:SS" format
   */
  private formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format timestamp in short ISO format (YYYY-MM-DD HH:MM)
   */
  private formatDateShort(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const mins = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${mins}`;
    } catch {
      return timestamp;
    }
  }

  /**
   * Format timestamp in long format (like call-logs)
   */
  private formatDateLong(timestamp: string): string {
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
   * Format phone number for display
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
   * Get play icon SVG
   */
  private getPlayIcon(): string {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>`;
  }

  /**
   * Get pause icon SVG
   */
  private getPauseIcon(): string {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
    </svg>`;
  }

  /**
   * Get phone icon SVG
   */
  private getPhoneIcon(): string {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
    </svg>`;
  }

  /**
   * Get trash icon SVG
   */
  private getTrashIcon(): string {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>`;
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

        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

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

        /* Voicemail List */
        .voicemail-list {
          display: flex;
          flex-direction: column;
        }

        /* Voicemail Item Container */
        .voicemail-item {
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
          cursor: pointer;
        }

        .voicemail-item.expanded {
          cursor: default;
        }

        .voicemail-item:last-child {
          border-bottom: none;
        }

        .voicemail-item:hover {
          background: rgba(0, 0, 0, 0.02);
        }

        /* Collapsed Row - hidden when expanded */
        .voicemail-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          padding: 12px 16px;
        }

        .voicemail-item.expanded .voicemail-row {
          display: none;
        }

        /* Unread dot */
        .unread-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--ds-color-primary);
          margin-right: 12px;
          flex-shrink: 0;
        }

        .unread-dot.hidden {
          visibility: hidden;
        }

        /* Row content - collapsed */
        .row-content {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 4px 16px;
        }

        .caller-name {
          font-size: 16px;
          color: var(--ds-color-text);
          grid-column: 1;
          grid-row: 1;
        }

        .caller-name.unread {
          font-weight: 600;
        }

        .phone-number-collapsed {
          font-size: 14px;
          color: rgba(0, 0, 0, 0.5);
          grid-column: 1;
          grid-row: 2;
        }

        .timestamp {
          font-size: 14px;
          color: rgba(0, 0, 0, 0.4);
          grid-column: 2;
          grid-row: 1;
          text-align: right;
        }

        .duration {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.4);
          grid-column: 2;
          grid-row: 2;
          text-align: right;
        }

        /* Chevron */
        .chevron {
          color: rgba(0, 0, 0, 0.3);
          margin-left: 8px;
          transition: transform 0.2s ease;
        }

        .voicemail-item.expanded .chevron {
          transform: rotate(90deg);
        }

        /* Expanded detail section - replaces collapsed row */
        .voicemail-detail {
          display: none;
          padding: 16px;
        }

        .voicemail-item.expanded .voicemail-detail {
          display: block;
        }

        /* Detail rows */
        .detail-caller {
          font-size: 18px;
          font-weight: 600;
          color: var(--ds-color-text);
          margin-bottom: 4px;
        }

        .detail-phone {
          font-size: 15px;
          color: rgba(0, 0, 0, 0.6);
          margin-bottom: 4px;
        }

        .detail-date {
          font-size: 14px;
          color: rgba(0, 0, 0, 0.5);
          margin-bottom: 16px;
        }

        /* Progress bar row */
        .progress-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .progress-bar {
          flex: 1;
          height: 4px;
          background: rgba(0, 0, 0, 0.1);
          border-radius: 2px;
          cursor: pointer;
          position: relative;
        }

        .progress-fill {
          height: 100%;
          background: var(--ds-color-primary);
          border-radius: 2px;
          width: 0%;
        }

        .progress-handle {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 14px;
          height: 14px;
          background: var(--ds-color-primary);
          border-radius: 50%;
          cursor: grab;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .progress-handle:active {
          cursor: grabbing;
        }

        .time-current,
        .time-remaining {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.5);
          min-width: 36px;
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
          margin-bottom: 16px;
        }

        .play-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          background: var(--ds-color-primary);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: opacity 0.15s;
        }

        .play-btn:hover {
          opacity: 0.85;
        }

        /* Action buttons */
        .action-buttons {
          display: flex;
          gap: 8px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: var(--ds-border-radius);
          border: none;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        }

        .action-btn:hover {
          opacity: 0.85;
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
          padding: 12px;
          background: rgba(0, 0, 0, 0.03);
          border-radius: var(--ds-border-radius);
        }

        .transcription-header {
          font-size: 13px;
          font-weight: 600;
          color: rgba(0, 0, 0, 0.5);
          margin-bottom: 8px;
        }

        .transcription-text {
          font-size: 14px;
          line-height: 1.5;
          color: var(--ds-color-text);
        }

        /* Hidden audio element */
        audio {
          display: none;
        }
      </style>

      <div class="container">
        ${this.renderContent()}
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
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading voicemails...</p>
        </div>
      `;
    }

    if (this.error) {
      return `
        <div class="error">
          <p>${this.error}</p>
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
          <p>No voicemails</p>
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

        return `
          <div class="voicemail-item ${isExpanded ? 'expanded' : ''}" data-id="${vm.id}">
            <div class="voicemail-row">
              <span class="unread-dot ${isUnread ? '' : 'hidden'}"></span>
              <div class="row-content">
                <span class="caller-name ${isUnread ? 'unread' : ''}">${vm.from_name || 'Unknown'}</span>
                <span class="phone-number-collapsed">${this.formatPhoneNumber(vm.from_number)}</span>
                <span class="timestamp">${this.formatDateShort(vm.created_at)}</span>
                <span class="duration">${this.formatTime(vm.duration_seconds)}</span>
              </div>
              <span class="chevron">›</span>
            </div>
            ${this.renderExpandedDetail(vm)}
          </div>
        `;
      })
      .join('');

    return `<div class="voicemail-list">${items}</div>`;
  }

  /**
   * Render expanded voicemail detail
   */
  private renderExpandedDetail(vm: Voicemail): string {
    const transcription =
      vm.transcription ||
      '"Hi, this is a sample transcription of the voicemail message. The actual transcription will appear here once available..."';

    return `
      <div class="voicemail-detail" data-detail-id="${vm.id}">
        <audio data-id="${vm.id}" preload="auto">
          <source src="${vm.audio_url}" type="audio/${vm.format || 'wav'}">
        </audio>

        <!-- Row 1: Caller ID -->
        <div class="detail-caller">${vm.from_name || 'Unknown'}</div>

        <!-- Row 2: Phone number -->
        <div class="detail-phone">${this.formatPhoneNumber(vm.from_number)}</div>

        <!-- Row 3: Timestamp -->
        <div class="detail-date">${this.formatDateLong(vm.created_at)}</div>

        <!-- Row 4: Progress bar -->
        <div class="progress-row">
          <span class="time-current">${this.formatTime(this.currentTime)}</span>
          <div class="progress-bar" data-action="seek">
            <div class="progress-fill" style="width: ${this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0}%"></div>
            <div class="progress-handle" style="left: ${this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0}%"></div>
          </div>
          <span class="time-remaining">-${this.formatTime(this.duration - this.currentTime || vm.duration_seconds)}</span>
        </div>

        <!-- Row 5: Play button (left) + Action buttons (right) -->
        <div class="controls-row">
          <button class="play-btn" data-action="play" data-id="${vm.id}">
            ${this.isPlaying && this.audioElement?.getAttribute('data-id') === vm.id ? this.getPauseIcon() : this.getPlayIcon()}
          </button>
          <div class="action-buttons">
            <button class="action-btn call" data-action="call" data-number="${vm.from_number}">
              ${this.getPhoneIcon()}
              Call
            </button>
            <button class="action-btn delete" data-action="delete" data-id="${vm.id}">
              ${this.getTrashIcon()}
              Delete
            </button>
          </div>
        </div>

        <!-- Row 6: Transcription -->
        <div class="transcription">
          <div class="transcription-header">Transcription</div>
          <div class="transcription-text">${transcription}</div>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    if (!this.shadowRoot) return;

    // Item click to expand/collapse (works on both collapsed row and expanded detail header)
    const items = this.shadowRoot.querySelectorAll('.voicemail-item');
    items.forEach((item) => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Don't toggle if clicking on buttons or interactive elements
        if (target.closest('button') || target.closest('.progress-row') || target.closest('.transcription')) return;

        const id = item.getAttribute('data-id');
        // Only expand, don't collapse when clicking on already expanded item
        if (id && this.expandedId !== id) this.toggleExpand(id);
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
        if (id && confirm('Delete this voicemail?')) {
          this.deleteVoicemail(id);
        }
      });
    });

    // Call button (placeholder - logs for now)
    const callBtns = this.shadowRoot.querySelectorAll('[data-action="call"]');
    callBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const number = btn.getAttribute('data-number');
        console.log('Call back:', number);
        // TODO: Implement call functionality
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
