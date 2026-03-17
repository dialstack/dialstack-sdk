# SDK Component Architecture

## API Access Pattern

Components must NOT call the API raw (via `fetchApi` or `fetchComponentData` with URL strings). Instead:

1. Add typed methods to `DialStackInstance` (in `types/core.ts`) and implement them in `core/instance.ts`
2. Components call `this.instance.methodName()` — same methods available to SDK consumers
3. This ensures components and consumers share the same typed, tested API surface

**Component scope:** Only routes called by SDK embedded components (`sdk/src/components/`) via session tokens need entries in the API's **component scope** (`api/internal/middleware/component_scope.go` `componentRoutes`). If you add a new SDK component method that hits the API through a session token, add the route there — missing entries cause silent 403s. Routes consumed only by Admin (via `internalApiFetch`) or by API-key auth do **not** need scope entries; they bypass component scoping entirely.
