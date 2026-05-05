/**
 * AIAgent web component — singleton editor for one DialStack AI agent.
 *
 * Framework-agnostic: drops into any HTML page as `<dialstack-ai-agent>`.
 * The React wrapper at sdk/src/react/AIAgent.tsx is a thin shim that
 * forwards props to setters and listens for `dialstack:ai-agent:saved` /
 * `dialstack:ai-agent:error` events.
 *
 * shadowRoot.innerHTML follows the same pattern as voicemails.ts /
 * call-logs.ts: HTML is templated server-side from typed state with all
 * user-controlled values run through `escape()` before interpolation.
 */

import { BaseComponent } from './base-component';
import type { AIAgent as AIAgentData, FAQItem, UpdateAIAgentRequest } from '../types/ai-agent';
import type { AIAgentField } from '../types/components';
import type { Locale } from '../locales';

type AIAgentLocale = Locale['aiAgent'];

// Tiny `{var}` interpolator. Locale strings put placeholders in braces so
// translators don't have to hand-stitch concatenations.
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

// Server-enforced limits — mirrored here so save can be disabled before the
// API rejects the request. See api/internal/models/ai_agent.go.
const MAX_NAME = 255;
const MAX_PERSONA = 255;
const MAX_GREETING = 255;
const MAX_INSTRUCTIONS = 10000;
const MAX_FAQ_FIELD = 2000;
const MAX_FAQ_ITEMS = 50;

interface FormState {
  /** Agent ID this form was loaded from. */
  agentId: string;
  name: string;
  personaName: string;
  greetingName: string;
  instructions: string;
  faq: FAQItem[];
}

function toForm(agent: AIAgentData): FormState {
  return {
    agentId: agent.id,
    name: agent.name ?? '',
    personaName: agent.persona_name ?? '',
    greetingName: agent.greeting_name ?? '',
    instructions: agent.instructions ?? '',
    faq: (agent.faq_responses ?? []).map((f) => ({ question: f.question, answer: f.answer })),
  };
}

function buildPayload(form: FormState, hidden: Set<AIAgentField>): UpdateAIAgentRequest {
  // Hidden fields are not part of this editor's surface — omit them so the
  // host's stored value is preserved. Visible fields are sent verbatim,
  // including empty strings: when the operator clears persona/greeting/
  // instructions and saves, the API receives an explicit empty string and
  // the storage layer clears the value (vs. treating an omission as
  // "preserve existing" and silently keeping the old text).
  const payload: UpdateAIAgentRequest = {};
  if (!hidden.has('name')) payload.name = form.name.trim();
  if (!hidden.has('persona_name')) payload.persona_name = form.personaName.trim();
  if (!hidden.has('greeting_name')) payload.greeting_name = form.greetingName.trim();
  if (!hidden.has('instructions')) payload.instructions = form.instructions.trim();
  if (!hidden.has('faq')) {
    payload.faq_responses = form.faq
      .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
      .filter((f) => f.question.length > 0 || f.answer.length > 0);
  }
  return payload;
}

function validate(form: FormState, hidden: Set<AIAgentField>, l: AIAgentLocale): string | null {
  const e = l.errors;
  if (!hidden.has('name')) {
    const name = form.name.trim();
    if (name.length === 0) return e.nameRequired;
    if (name.length > MAX_NAME) return interpolate(e.nameMaxLength, { max: MAX_NAME });
  }
  if (!hidden.has('persona_name') && form.personaName.length > MAX_PERSONA)
    return interpolate(e.personaNameMaxLength, { max: MAX_PERSONA });
  if (!hidden.has('greeting_name') && form.greetingName.length > MAX_GREETING)
    return interpolate(e.greetingNameMaxLength, { max: MAX_GREETING });
  if (!hidden.has('instructions') && form.instructions.length > MAX_INSTRUCTIONS)
    return interpolate(e.instructionsMaxLength, { max: MAX_INSTRUCTIONS });
  if (!hidden.has('faq')) {
    const nonEmptyFaq = form.faq.filter(
      (f) => f.question.trim().length > 0 || f.answer.trim().length > 0
    );
    if (nonEmptyFaq.length > MAX_FAQ_ITEMS)
      return interpolate(e.faqMaxItems, { max: MAX_FAQ_ITEMS });
    for (const f of nonEmptyFaq) {
      const q = f.question.trim();
      const a = f.answer.trim();
      if (q.length === 0 || a.length === 0) return e.faqIncompleteEntry;
      if (q.length > MAX_FAQ_FIELD || a.length > MAX_FAQ_FIELD)
        return interpolate(e.faqFieldMaxLength, { max: MAX_FAQ_FIELD });
    }
  }
  return null;
}

const STYLES = `
  :host {
    display: block;
    width: 100%;
    color: var(--ds-color-text, #1e293b);
  }

  .ds-ai-agent {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .ds-ai-agent--loading,
  .ds-ai-agent--error {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    color: var(--ds-color-text-secondary, #475569);
    font-size: var(--ds-font-size-sm, 14px);
  }

  .ds-ai-agent--error {
    color: var(--ds-color-error, #dc2626);
  }

  .ds-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ds-field__label {
    font-size: var(--ds-font-size-sm, 14px);
    font-weight: var(--ds-font-weight-medium, 500);
    color: var(--ds-color-text, #1e293b);
  }

  .ds-field__hint {
    font-size: var(--ds-font-size-xs, 12px);
    color: var(--ds-color-text-secondary, #64748b);
  }

  .ds-input,
  .ds-textarea {
    width: 100%;
    padding: 8px 12px;
    font: inherit;
    font-size: var(--ds-font-size-sm, 14px);
    color: var(--ds-color-text, #1e293b);
    background: var(--ds-color-background, #ffffff);
    border: 1px solid var(--ds-color-border, #e2e8f0);
    border-radius: var(--ds-border-radius, 8px);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .ds-textarea {
    resize: vertical;
    min-height: 96px;
    font-family: inherit;
  }

  .ds-input:focus,
  .ds-textarea:focus {
    outline: none;
    border-color: var(--ds-color-primary, #3b82f6);
    box-shadow: 0 0 0 3px var(--ds-color-primary-translucent, rgba(59, 130, 246, 0.15));
  }

  .ds-input:disabled,
  .ds-textarea:disabled {
    background: var(--ds-color-surface-subtle, #f8fafc);
    color: var(--ds-color-text-secondary, #64748b);
    cursor: not-allowed;
  }

  .ds-faq {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ds-faq__row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border: 1px solid var(--ds-color-border, #e2e8f0);
    border-radius: var(--ds-border-radius, 8px);
    background: var(--ds-color-surface-subtle, #f8fafc);
  }

  .ds-faq__row-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--ds-font-size-xs, 12px);
    color: var(--ds-color-text-secondary, #64748b);
  }

  .ds-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    font: inherit;
    font-size: var(--ds-font-size-sm, 14px);
    font-weight: var(--ds-font-weight-medium, 500);
    border-radius: var(--ds-border-radius, 8px);
    border: 1px solid transparent;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .ds-button--primary {
    background: var(--ds-color-primary, #3b82f6);
    color: var(--ds-color-primary-contrast, #ffffff);
  }

  .ds-button--primary:hover:not(:disabled) {
    background: var(--ds-color-primary-hover, #2563eb);
  }

  .ds-button--ghost {
    background: transparent;
    color: var(--ds-color-text-secondary, #475569);
    border-color: var(--ds-color-border, #e2e8f0);
  }

  .ds-button--ghost:hover:not(:disabled) {
    background: var(--ds-color-surface-subtle, #f1f5f9);
    color: var(--ds-color-text, #1e293b);
  }

  .ds-button--link {
    background: transparent;
    color: var(--ds-color-primary, #3b82f6);
    padding: 4px 8px;
    font-size: var(--ds-font-size-xs, 12px);
  }

  .ds-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ds-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ds-status {
    font-size: var(--ds-font-size-xs, 12px);
    color: var(--ds-color-text-secondary, #64748b);
  }

  .ds-status--error { color: var(--ds-color-error, #dc2626); }
  .ds-status--success { color: var(--ds-color-success, #16a34a); }
`;

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * AIAgentComponent renders a form for editing one AI agent. Emits:
 *   - `dialstack:ai-agent:saved` (CustomEvent<{ agentId }>) on save success
 *   - `dialstack:ai-agent:error` (CustomEvent<{ error: Error }>) on save / load failure
 *
 * Configuration is supported via two equivalent paths so non-React hosts can
 * drop the element in declaratively:
 *
 *   - Imperative setters (`setAgentId`, `setHideFields`) — used by the React
 *     wrapper and any caller holding an element reference.
 *   - HTML attributes (`agent-id`, `hide-fields`) — `<dialstack-ai-agent
 *     agent-id="aia_..." hide-fields="name,faq">`. Attribute changes are
 *     observed via `attributeChangedCallback` and routed through the same
 *     setters, so the two paths cannot drift.
 *
 * The pattern mirrors `routing-target.ts`'s `observedAttributes` precedent.
 */
export class AIAgentComponent extends BaseComponent {
  static get observedAttributes(): string[] {
    return ['agent-id', 'hide-fields'];
  }

  private agentId: string | null = null;
  private hiddenFields: Set<AIAgentField> = new Set();

  // Loaded form state (null while pending or after agentId change without a fresh fetch)
  private loadedForm: FormState | null = null;
  private loadError: Error | null = null;
  private saveError: string | null = null;
  private saving: boolean = false;
  private savedAt: number | null = null;

  // Cancellation flag for in-flight loads when agentId changes mid-fetch.
  private fetchSeq: number = 0;

  protected initialize(): void {
    if ((this as unknown as { isInitialized: boolean }).isInitialized) return;
    (this as unknown as { isInitialized: boolean }).isInitialized = true;
    this.render();
    void this.loadAgent();
  }

  protected cleanup(): void {
    this.fetchSeq++;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === 'agent-id') {
      if (newValue) this.setAgentId(newValue);
      return;
    }
    if (name === 'hide-fields') {
      const tokens = (newValue ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean) as AIAgentField[];
      const allowed: AIAgentField[] = [
        'name',
        'persona_name',
        'greeting_name',
        'instructions',
        'faq',
      ];
      this.setHideFields(tokens.filter((t) => allowed.includes(t)));
    }
  }

  // ============================================================================
  // Public setters (called by React wrapper or directly)
  // ============================================================================

  setAgentId(agentId: string): void {
    if (this.agentId === agentId) return;
    this.agentId = agentId;
    this.loadedForm = null;
    this.loadError = null;
    this.savedAt = null;
    if ((this as unknown as { isInitialized: boolean }).isInitialized) {
      void this.loadAgent();
      this.render();
    }
  }

  setHideFields(fields: AIAgentField[]): void {
    this.hiddenFields = new Set(fields);
    if ((this as unknown as { isInitialized: boolean }).isInitialized) this.render();
  }

  // ============================================================================
  // Data flow
  // ============================================================================

  private async loadAgent(): Promise<void> {
    if (!this.instance || !this.agentId) return;
    const seq = ++this.fetchSeq;
    try {
      const agent = await this.instance.aiAgents.retrieve(this.agentId);
      if (seq !== this.fetchSeq) return; // superseded by a newer setAgentId
      this.loadedForm = toForm(agent);
      this.loadError = null;
      this.render();
    } catch (err) {
      if (seq !== this.fetchSeq) return;
      const error = err instanceof Error ? err : new Error(String(err));
      this.loadError = error;
      this.render();
      this.dispatchEvent(
        new CustomEvent('dialstack:ai-agent:error', { detail: { error }, bubbles: true })
      );
    }
  }

  private get formForCurrentAgent(): FormState | null {
    return this.loadedForm && this.loadedForm.agentId === this.agentId ? this.loadedForm : null;
  }

  private async handleSave(): Promise<void> {
    const form = this.formForCurrentAgent;
    if (!form || !this.instance || !this.agentId) return;
    const error = validate(form, this.hiddenFields, this.locale.aiAgent);
    if (error) {
      this.saveError = error;
      this.render();
      return;
    }
    this.saving = true;
    this.saveError = null;
    this.render();
    try {
      const updated = await this.instance.aiAgents.update(
        this.agentId,
        buildPayload(form, this.hiddenFields)
      );
      this.loadedForm = toForm(updated);
      this.savedAt = Date.now();
      this.dispatchEvent(
        new CustomEvent('dialstack:ai-agent:saved', {
          detail: { agentId: updated.id },
          bubbles: true,
        })
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.saveError = e.message;
      this.dispatchEvent(
        new CustomEvent('dialstack:ai-agent:error', { detail: { error: e }, bubbles: true })
      );
    } finally {
      this.saving = false;
      this.render();
    }
  }

  private updateField<K extends keyof Omit<FormState, 'faq' | 'agentId'>>(
    key: K,
    value: FormState[K]
  ): void {
    if (!this.loadedForm) return;
    this.loadedForm = { ...this.loadedForm, [key]: value };
    this.savedAt = null;
    this.refreshActions();
  }

  private updateFaq(index: number, key: keyof FAQItem, value: string): void {
    if (!this.loadedForm) return;
    const current = this.loadedForm.faq[index];
    if (!current) return;
    const next = this.loadedForm.faq.slice();
    next[index] =
      key === 'question'
        ? { question: value, answer: current.answer }
        : { question: current.question, answer: value };
    this.loadedForm = { ...this.loadedForm, faq: next };
    this.savedAt = null;
    this.refreshActions();
  }

  /**
   * Re-render just the Save button + status span in place, without
   * rewriting the form fields above. Lets validation state track typing
   * (so fixing an invalid field re-enables Save) while preserving focus
   * on the input the operator is editing.
   */
  private refreshActions(): void {
    if (!this.shadowRoot) return;
    const actions = this.shadowRoot.querySelector('.ds-actions');
    const form = this.formForCurrentAgent;
    if (!actions || !form) return;
    actions.innerHTML = this.renderActionsContent(form);
    // Re-bind the save button click — innerHTML wipes the previous listener.
    actions.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      void this.handleSave();
    });
  }

  private renderActionsContent(form: FormState): string {
    const l = this.locale.aiAgent;
    const validationError = validate(form, this.hiddenFields, l);
    const dis = (cond: boolean) => (cond ? 'disabled' : '');
    const status = this.saveError
      ? `<span class="ds-status ds-status--error" role="alert">${escape(this.saveError)}</span>`
      : !this.saveError && validationError
        ? `<span class="ds-status ds-status--error">${escape(validationError)}</span>`
        : !this.saveError && !validationError && this.savedAt
          ? `<span class="ds-status ds-status--success">${escape(l.saved)}</span>`
          : '';
    const buttonLabel = this.saving ? l.saving : l.save;
    return `<button type="button" class="ds-button ds-button--primary" data-action="save" ${dis(this.saving || validationError !== null)}>${escape(buttonLabel)}</button>${status}`;
  }

  private addFaq(): void {
    if (!this.loadedForm) return;
    this.loadedForm = {
      ...this.loadedForm,
      faq: [...this.loadedForm.faq, { question: '', answer: '' }],
    };
    this.savedAt = null;
    this.render();
  }

  private removeFaq(index: number): void {
    if (!this.loadedForm) return;
    const next = this.loadedForm.faq.slice();
    next.splice(index, 1);
    this.loadedForm = { ...this.loadedForm, faq: next };
    this.savedAt = null;
    this.render();
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  protected render(): void {
    if (!this.shadowRoot) return;
    const l = this.locale.aiAgent;

    if (this.loadError) {
      this.shadowRoot.innerHTML = this.renderShell(
        `<div class="ds-ai-agent ds-ai-agent--error" role="alert">${escape(interpolate(l.loadFailed, { message: this.loadError.message }))}</div>`
      );
      return;
    }

    const form = this.formForCurrentAgent;
    if (!form) {
      this.shadowRoot.innerHTML = this.renderShell(
        `<div class="ds-ai-agent ds-ai-agent--loading">${escape(l.loading)}</div>`
      );
      return;
    }

    const f = l.fields;
    const canAddFaq = form.faq.length < MAX_FAQ_ITEMS;
    const dis = (cond: boolean) => (cond ? 'disabled' : '');
    const greetingHint = form.greetingName
      ? interpolate(f.greetingNameHintWithName, { name: escape(form.greetingName) })
      : f.greetingNameHintGeneric;

    this.shadowRoot.innerHTML = this.renderShell(`
      <div class="ds-ai-agent">
        ${this.hiddenFields.has('name') ? '' : this.renderTextField('name', f.name, form.name, MAX_NAME, this.saving)}
        ${this.hiddenFields.has('persona_name') ? '' : this.renderTextField('personaName', f.personaName, form.personaName, MAX_PERSONA, this.saving, f.personaNamePlaceholder, escape(f.personaNameHint))}
        ${this.hiddenFields.has('greeting_name') ? '' : this.renderTextField('greetingName', f.greetingName, form.greetingName, MAX_GREETING, this.saving, f.greetingNamePlaceholder, greetingHint)}
        ${
          this.hiddenFields.has('instructions')
            ? ''
            : `<div class="ds-field">
                <label class="ds-field__label" for="ds-aia-instructions">${escape(f.instructions)}</label>
                <textarea id="ds-aia-instructions" class="ds-textarea" data-field="instructions" maxlength="${MAX_INSTRUCTIONS}" rows="6" ${dis(this.saving)}>${escape(form.instructions)}</textarea>
                <div class="ds-field__hint">${escape(f.instructionsHint)}</div>
              </div>`
        }
        ${this.hiddenFields.has('faq') ? '' : this.renderFaq(form.faq, canAddFaq)}
        <div class="ds-actions">${this.renderActionsContent(form)}</div>
      </div>
    `);

    this.attachHandlers();
  }

  private renderShell(body: string): string {
    // applyAppearanceStyles emits the SDK's CSS-variable contract (theme,
    // layout, density) so this component honors `dialstack.update({appearance})`
    // the same way voicemails / call-logs do. STYLES is component-local and
    // overrides nothing the appearance layer sets.
    return `<style>${this.applyAppearanceStyles()}${STYLES}</style>${body}`;
  }

  private renderTextField(
    field: keyof Omit<FormState, 'faq' | 'agentId'>,
    label: string,
    value: string,
    maxLength: number,
    saving: boolean,
    placeholder?: string,
    hintHtml?: string
  ): string {
    const id = `ds-aia-${field}`;
    return `
      <div class="ds-field">
        <label class="ds-field__label" for="${id}">${escape(label)}</label>
        <input id="${id}" class="ds-input" type="text" data-field="${field}" value="${escape(value)}" maxlength="${maxLength}" ${placeholder ? `placeholder="${escape(placeholder)}"` : ''} ${saving ? 'disabled' : ''} />
        ${hintHtml ? `<div class="ds-field__hint">${hintHtml}</div>` : ''}
      </div>
    `;
  }

  private renderFaq(faq: FAQItem[], canAddFaq: boolean): string {
    const f = this.locale.aiAgent.fields;
    const rows =
      faq.length === 0
        ? `<div class="ds-field__hint">${escape(f.faqEmpty)}</div>`
        : faq
            .map(
              (item, i) => `
              <div class="ds-faq__row">
                <div class="ds-faq__row-header">
                  <span>${escape(interpolate(f.faqEntry, { index: i + 1 }))}</span>
                  <button type="button" class="ds-button ds-button--link" data-action="remove-faq" data-index="${i}" aria-label="${escape(interpolate(f.faqRemoveLabel, { index: i + 1 }))}" ${this.saving ? 'disabled' : ''}>${escape(f.faqRemove)}</button>
                </div>
                <input class="ds-input" type="text" data-faq-index="${i}" data-faq-field="question" placeholder="${escape(f.faqQuestion)}" value="${escape(item.question)}" maxlength="${MAX_FAQ_FIELD}" aria-label="${escape(interpolate(f.faqQuestionLabel, { index: i + 1 }))}" ${this.saving ? 'disabled' : ''} />
                <textarea class="ds-textarea" data-faq-index="${i}" data-faq-field="answer" placeholder="${escape(f.faqAnswer)}" maxlength="${MAX_FAQ_FIELD}" rows="3" aria-label="${escape(interpolate(f.faqAnswerLabel, { index: i + 1 }))}" ${this.saving ? 'disabled' : ''}>${escape(item.answer)}</textarea>
              </div>`
            )
            .join('');

    return `
      <div class="ds-field">
        <span class="ds-field__label">${escape(f.faq)}</span>
        <div class="ds-faq">
          ${rows}
          <div>
            <button type="button" class="ds-button ds-button--ghost" data-action="add-faq" ${this.saving || !canAddFaq ? 'disabled' : ''}>${escape(f.faqAdd)}</button>
          </div>
        </div>
      </div>
    `;
  }

  private attachHandlers(): void {
    if (!this.shadowRoot) return;

    // Plain-text fields: input event syncs into form state without re-render
    // (focus would otherwise be lost on every keystroke).
    this.shadowRoot.querySelectorAll('[data-field]').forEach((el) => {
      const field = (el as HTMLElement).dataset.field as keyof Omit<FormState, 'faq' | 'agentId'>;
      el.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
        this.updateField(field, value);
      });
    });

    // FAQ input syncs without re-render for the same focus-preservation reason.
    this.shadowRoot.querySelectorAll('[data-faq-index]').forEach((el) => {
      const idx = Number((el as HTMLElement).dataset.faqIndex);
      const key = (el as HTMLElement).dataset.faqField as keyof FAQItem;
      el.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
        this.updateFaq(idx, key, value);
      });
    });

    // Action buttons trigger re-render (structure changes).
    this.shadowRoot.querySelectorAll('[data-action]').forEach((el) => {
      const action = (el as HTMLElement).dataset.action;
      const idxStr = (el as HTMLElement).dataset.index;
      el.addEventListener('click', () => {
        if (action === 'save') void this.handleSave();
        else if (action === 'add-faq') this.addFaq();
        else if (action === 'remove-faq' && idxStr !== undefined) this.removeFaq(Number(idxStr));
      });
    });
  }
}

if (typeof window !== 'undefined' && !customElements.get('dialstack-ai-agent')) {
  customElements.define('dialstack-ai-agent', AIAgentComponent);
}
