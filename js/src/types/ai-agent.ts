/**
 * AI agent types for DialStack SDK.
 *
 * These mirror the API resource at /v1/ai-agents/:id (see
 * `api/internal/handlers/ai_agent.go` for the response shape and
 * `api/internal/models/ai_agent.go` for the validation rules).
 */

/** A single FAQ entry exposed to the AI agent. */
export interface FAQItem {
  question: string;
  answer: string;
}

/** Webhook config for tool-calls. Privileged host surfaces may edit this in host mode. */
export interface SchedulingConfig {
  webhook_url?: string;
}

/** AI agent as returned by GET /v1/ai-agents/:id. */
export interface AIAgent {
  id: string;
  name: string;
  voice_app?: string;
  /** @deprecated Use `voice_app`. Retained for backwards compatibility. */
  voice_app_id: string;
  persona_name?: string | null;
  greeting_name?: string | null;
  instructions?: string | null;
  faq_responses: FAQItem[];
  scheduling?: SchedulingConfig | null;
  extension_number?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Partial-update payload for POST /v1/ai-agents/:id.
 *
 * The API treats `faq_responses` as authoritative-replace: omitting it
 * preserves the stored value, sending it (even as `[]`) overwrites all
 * items. `scheduling` is intentionally not exposed on the SDK-owned update
 * request. Privileged host surfaces can receive scheduling through
 * `AIAgentHostSubmitPayload` and decide whether to forward it server-side.
 */
export interface UpdateAIAgentRequest {
  name?: string;
  persona_name?: string | null;
  greeting_name?: string | null;
  instructions?: string | null;
  faq_responses?: FAQItem[];
}

export interface AIAgentFormValues {
  name?: string;
  extension_number?: string | null;
  persona_name?: string | null;
  greeting_name?: string | null;
  instructions?: string | null;
  faq_responses?: FAQItem[];
  scheduling?: SchedulingConfig | null;
}

export interface AIAgentHostSubmitPayload {
  name: string;
  extension_number?: string;
  persona_name?: string;
  greeting_name?: string;
  instructions?: string;
  faq_responses: FAQItem[];
  scheduling?: SchedulingConfig;
}

export interface AIAgentHostCreateResult {
  agentId: string;
  voiceAppId?: string;
  name?: string;
}

export interface AIAgentExtensionAvailabilityResult {
  available: boolean;
  message?: string;
}
