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

/** Webhook config for tool-calls. Server-managed; not edited by the SDK. */
export interface SchedulingConfig {
  webhook_url?: string;
}

/** AI agent as returned by GET /v1/ai-agents/:id. */
export interface AIAgent {
  id: string;
  name: string;
  voice_app_id: string;
  persona_name?: string | null;
  greeting_name?: string | null;
  instructions?: string | null;
  faq_responses: FAQItem[];
  scheduling?: SchedulingConfig | null;
  created_at: string;
  updated_at: string;
}

/**
 * Partial-update payload for POST /v1/ai-agents/:id.
 *
 * The API treats `faq_responses` as authoritative-replace: omitting it
 * preserves the stored value, sending it (even as `[]`) overwrites all
 * items. `scheduling` is intentionally not exposed here — host apps
 * configure it server-to-server.
 */
export interface UpdateAIAgentRequest {
  name?: string;
  persona_name?: string | null;
  greeting_name?: string | null;
  instructions?: string | null;
  faq_responses?: FAQItem[];
}
