# SDK Component Architecture

## API Access Pattern

Components must NOT call the API raw (via `fetchApi` or `fetchComponentData` with URL strings). Instead:

1. Add typed methods to `DialStackInstance` (in `types/core.ts`) and implement them in `core/instance.ts`
2. Components call `this.instance.methodName()` — same methods available to SDK consumers
3. This ensures components and consumers share the same typed, tested API surface

**Important:** When consuming a new or existing API endpoint from the SDK, verify that the route is registered in the API's **component scope** (`api/internal/middleware/component_scope.go` `componentRoutes`). Session-authenticated requests (which the SDK uses) are restricted to routes listed there. Missing entries cause silent 403s at runtime.
