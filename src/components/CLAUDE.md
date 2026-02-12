# SDK Component Architecture

## API Access Pattern

Components must NOT call the API raw (via `fetchApi` or `fetchComponentData` with URL strings). Instead:

1. Add typed methods to `DialStackInstance` (in `types/core.ts`) and implement them in `core/instance.ts`
2. Components call `this.instance.methodName()` — same methods available to SDK consumers
3. This ensures components and consumers share the same typed, tested API surface
