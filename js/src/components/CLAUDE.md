# SDK Component Architecture

## API Access Pattern

Components must NOT call the API raw (via `fetchApi` or `fetchComponentData` with URL strings). Instead:

1. Add typed methods to `DialStackInstance` (in `types/core.ts`) and implement them in `core/instance.ts`
2. Components call `this.instance.methodName()` — same methods available to SDK consumers
3. This ensures components and consumers share the same typed, tested API surface

**Component scope:** Only routes called by SDK embedded components (`sdk/src/components/`) via session tokens need entries in the API's **component scope** (`api/internal/middleware/component_scope.go` `componentRoutes`). If you add a new SDK component method that hits the API through a session token, add the route there — missing entries cause silent 403s. Routes consumed only by Admin (via `internalApiFetch`) or by API-key auth do **not** need scope entries; they bypass component scoping entirely.

## AIAgent Host Mode Boundary

`<AIAgent>` has two execution modes:

- Default SDK mode loads and updates an existing AI agent through the component-scoped SDK session. Keep this surface limited to fields already safe for embedded customers.
- Host mode (`mode="create"` or `onCreateRequested` / `onSaveRequested`) makes the SDK a reusable form only. Privileged surfaces such as Admin own create, extension assignment, scheduling webhook updates, and voice-app secret rotation through host callbacks and Admin BFF routes.

Do not add public/component-scope SDK routes for AI-agent create, extension availability or assignment, scheduling webhook mutation, or secret rotation unless the product explicitly decides those operations are safe for customer embeds. Prefer host callbacks when the goal is UI reuse without broadening the SDK session's authority.
