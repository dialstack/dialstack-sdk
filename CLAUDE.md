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

## Releases and Versioning

`@dialstack/sdk` releases are automated with [release-please](https://github.com/googleapis/release-please) (config: `release-please-config.json` + `.release-please-manifest.json` at the repo root; workflow: `.github/workflows/sdk-publish.yml`).

- Every merge to `main` that touches `sdk/**` is analyzed. Conventional commit types determine the next version bump: `fix:` → patch, `feat:` → minor, `!` / `BREAKING CHANGE:` footer → major.
- This repo uses regular merges, so release-please parses **each individual commit** brought in by a merged PR (merge commits themselves are ignored as non-conventional). Every commit message touching `sdk/**` must be a valid conventional commit that accurately describes impact — one stray `!` triggers a major. Multi-commit PRs produce one changelog line per conventional commit.
- release-please maintains an always-open release PR ("chore(main): release sdk X.Y.Z") with the version bump and generated `CHANGELOG.md` entries. **Merging that PR is the release**: it tags `sdk-vX.Y.Z` on the monorepo, publishes to npm, and mirrors a GitHub Release to the public `dialstack/dialstack-sdk` repo.
- **Curate the changelog before merging the release PR.** With regular merges, every visible-type commit (`feat`/`fix`/`perf`/`revert`) becomes its own changelog line, including intra-PR follow-ups like "address review feedback" that mean nothing to npm consumers. Before merging, edit `sdk/CHANGELOG.md` on the release PR's branch (`release-please--branches-main--components-sdk`): merge related lines into one entry per logical change, drop noise, and reword for an external audience. release-please preserves manual edits — it won't overwrite them on its next run. This is a job for Claude: ask it to "massage the SDK release changelog" and review the result.
- The release workflow automatically scrubs internal tracker references from the generated changelog on every push to the release branch, so they never reach the published package or the public mirror. Curation above is still about readability for external consumers, not ref hygiene.
- If a publish fails after the release PR merged, re-run via `workflow_dispatch` of `sdk-publish.yml` with `publish_npm: true` and `version: X.Y.Z` (checks out tag `sdk-vX.Y.Z` so the retry publishes that exact version even if `main` has moved on). The public-release mirror step is idempotent, and the retry path does not require the same-run Copybara sync to succeed.
