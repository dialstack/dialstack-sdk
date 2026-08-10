/**
 * `<AIAgent>` — the AI-receptionist configuration form.
 *
 * Its own entry point. Needs an initialized instance via
 * `<DialstackComponentsProvider>` from `@dialstack/sdk-react`.
 *
 * The prefill helpers live here rather than in the browser package: nothing there
 * used them, and they shape the form this component renders. A host calls them to
 * seed FAQ answers before submitting.
 *
 * @packageDocumentation
 */

export { AIAgent } from './react/AIAgent';
export type { AIAgentProps } from './react/AIAgent';

export { buildAIAgentPrefillFaq, shouldApplyPrefillFaq } from './ai-agent/prefill-faq';

// Resource types, so a host can type onSaved/onError without importing the
// browser package.
export type {
  AIAgent as AIAgentData,
  AIAgentExtensionAvailabilityResult,
  AIAgentFormValues,
  AIAgentHostCreateResult,
  AIAgentHostSubmitPayload,
  FAQItem,
  UpdateAIAgentRequest,
} from '@dialstack/sdk-js';
