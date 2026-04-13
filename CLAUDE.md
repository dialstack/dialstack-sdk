# SDK CLAUDE.md

## Storybook E2E Tests

SDK components have Storybook-based E2E tests that run in CI. When modifying components, run them locally before pushing to catch failures early:

```bash
# Terminal 1: start Storybook dev server
npm run storybook --prefix sdk

# Terminal 2: run E2E tests against the running Storybook
npm run test:e2e --prefix sdk
```

The E2E tests live in `__stories__/` directories alongside the components they cover. They use `@storybook/test` utilities (`within`, `userEvent`, `waitFor`) to interact with rendered stories.
