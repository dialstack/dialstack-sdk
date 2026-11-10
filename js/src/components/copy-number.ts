/**
 * A phone number with a button that copies it, shared by the call activity
 * cards and the Voicemails card: formatted for reading, copied in E.164 so it
 * pastes into any dialer.
 */

import { formatNumber } from '../utils/call-activity';

const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const COPIED_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

export interface CopyLabels {
  /** "Copy {number}", for the button's name */
  copy: (formatted: string) => string;
  /** "Copied", once it is */
  copied: string;
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The number and its copy button. */
export function renderCopyNumber(e164: string, labels: CopyLabels): string {
  const formatted = formatNumber(e164);
  const label = labels.copy(formatted);
  return `<span class="num" part="phone-number">${escape(formatted)}</span><button type="button" class="icon-button copy" part="copy-button" data-copy="${escape(e164)}" aria-label="${escape(label)}" title="${escape(label)}">${COPY_ICON}</button>`;
}

/** Wires every copy button under root; call after each render. */
export function attachCopyButtons(root: ParentNode | null | undefined, labels: CopyLabels): void {
  for (const button of root?.querySelectorAll<HTMLButtonElement>('button[data-copy]') ?? []) {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const number = button.dataset.copy ?? '';
      void navigator.clipboard?.writeText(number).then(() => {
        button.innerHTML = COPIED_ICON;
        button.setAttribute('aria-label', labels.copied);
        setTimeout(() => {
          button.innerHTML = COPY_ICON;
          button.setAttribute('aria-label', labels.copy(formatNumber(number)));
        }, 1500);
      });
    });
  }
}
