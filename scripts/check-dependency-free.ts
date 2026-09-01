#!/usr/bin/env node
/**
 * Claims the published packages make that no lint rule can express.
 *
 *   npm run check:deps --prefix sdk
 *   npm run check:deps --prefix sdk -- --fix
 *
 * `--fix` repairs the three *manifest* claims (1, 2 and the allowed-runtime-deps
 * list below) instead of reporting them — in the manifests and in the root lockfile's
 * matching `packages["sdk/*"]` nodes, which carry the same corruption — and skips
 * every claim about emitted output because those need a build. It exists for one
 * caller: the Dependabot
 * manifest-repair workflow (.github/workflows/dependabot-sdk-manifest-fix.yml).
 * npm has a workspace-save bug that writes a bumped package into *every* member's
 * `dependencies` — reproduced with a bare `npm install <pkg>@<v> -w sdk
 * --package-lock-only` against nothing but these manifests — and Dependabot cannot
 * undo it, because its updater snapshots and restores only the *root* package.json
 * around the workspace install, never the siblings npm touched. So the corruption
 * is not preventable from our side and lands on every npm bump PR; this repairs it
 * mechanically rather than by hand.
 *
 * Per-file import hygiene is eslint's job — `import-x/no-extraneous-dependencies`
 * and `import-x/no-relative-packages` (see eslint.config.js) give inline editor
 * feedback and a fix suggestion, which a repo-wide script cannot. What is left here
 * is what those rules structurally cannot check, because each is a property of the
 * *manifest* or the *emitted output* rather than of a source file:
 *
 *   1. The dependency-free packages' manifests must be **empty**, not merely
 *      consistent with their imports. `no-extraneous-dependencies` is satisfied by
 *      declaring `cmdk` and importing it — exactly the state that made a softphone
 *      consumer install 26 packages. "Everything imported is declared" and "nothing
 *      is declared" are different claims.
 *   2. The declared peer ranges must be the exact ranges we support, not whatever
 *      version a bump last installed.
 *   3. No emitted bundle may import a stylesheet.
 *   4. The Node client's declarations must name no sibling package.
 *   5. No published artifact may name a retired `@dialstack/sdk/*` specifier.
 *   6. Every package must ship a LICENSE.
 *   7. The UMD bundle must be entirely self-contained.
 *   8. The dependency-free packages must emit no bare specifier.
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SDK_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Packages whose whole point is a zero-dependency install. Both build with plain
 * tsc, which cannot inline anything, so an empty manifest is a structural
 * guarantee rather than something someone has to remember.
 */
const DEPENDENCY_FREE = ['webrtc', 'server'];

let failed = false;

/**
 * Repair the manifest claims rather than report them. Deliberately scoped to the
 * two manifest checks: everything else here reads dist/, and the caller
 * (a Dependabot PR) has no build.
 */
const FIX = process.argv.includes('--fix');

// Rewrite with npm's own formatting — two-space indent, trailing newline — so a
// repair produces no incidental diff beyond the keys it removed.
const writeManifest = (path: string, manifest: unknown): void =>
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);

/**
 * The same corruption lands in the root lockfile, and repairing only the manifests
 * would be a regression against the hand-reverts this replaces (all three cleaned
 * both files).
 *
 * npm's workspace-save bug writes the bumped package into `packages["sdk/*"]`'s
 * `dependencies` as well as into the sibling manifests. Extra lock entries are not
 * a sync error — `npm ci` still exits 0, because validateLockfile only walks the
 * ideal tree — so nothing catches it, and the lock now records the tooling as
 * *production* dependencies of the workspace members. That is exactly what
 * `--omit=dev` refuses to prune: .github/workflows/license-check.yml installs with
 * `npm ci --omit=dev` and feeds the result to a gated Trivy license scan, so a
 * manifest-only repair leaves storybook, eslint, jest and rollup in the tree that
 * scan calls "production dependencies".
 *
 * Only the fields the corruption touches are repaired. A lock node's
 * `devDependencies` are legitimate (sdk/js and sdk/react really do declare
 * rollup-plugin-dts) and are left alone.
 *
 * Deleting these keys is half the lock repair, and the half a dependency-free
 * script can do. The other half is out of reach here: the same bug also strips
 * `"dev": true` from hundreds of `node_modules/*` nodes, and dev-reachability is a
 * property of the whole graph, so no amount of key deletion restores it. That needs
 * npm to recompute the tree, which the caller does immediately after this
 * (`npm install --package-lock-only`, see the workflow's "Restore the lockfile's
 * dev flags" step). Together they reproduce the hand-reverts byte for byte.
 */
const LOCKFILE_PATH = join(SDK_ROOT, '..', 'package-lock.json');
const lockfile: { packages?: Record<string, Record<string, unknown>> } | null =
  FIX && existsSync(LOCKFILE_PATH) ? JSON.parse(readFileSync(LOCKFILE_PATH, 'utf8')) : null;
let lockfileChanged = false;

/** The lock's node for a published package, or undefined if the lock has none. */
const lockNode = (name: string): Record<string, unknown> | undefined =>
  lockfile?.packages?.[`sdk/${name}`];

for (const name of DEPENDENCY_FREE) {
  const manifestPath = join(SDK_ROOT, name, 'package.json');
  if (!existsSync(manifestPath)) {
    console.error(`✗ ${name}: no package.json — expected a package here`);
    failed = true;
    continue;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const problems: string[] = [];

  // Every field that puts something in a consumer's tree. `optional` counts: npm
  // installs an optionalDependency by default and only tolerates its *failure*, so
  // leaving it unchecked would let the 26-package install come back through a field
  // nobody was looking at. A peer counts too — the consumer still has to install it,
  // and it does not show up in `npm ls` the way a dependency does, which is
  // precisely why it is worth checking rather than assuming.
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
    const declared = manifest[field];
    if (declared && Object.keys(declared).length > 0) {
      problems.push(`declares ${field}: ${JSON.stringify(declared)}`);
    }
  }

  if (problems.length === 0) {
    console.log(`✓ ${name} — installs with zero dependencies`);
    continue;
  }

  // The claim is that these fields are empty, so the repair is to delete them
  // outright rather than subtract a known-bad list: anything that appears here is
  // wrong by definition, which is exactly why this pair needs no allowlist.
  if (FIX) {
    const node = lockNode(name);
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
      delete manifest[field];
      if (node && field in node) {
        delete node[field];
        lockfileChanged = true;
      }
    }
    writeManifest(manifestPath, manifest);
    console.log(`✓ ${name} — repaired to zero dependencies:`);
    for (const problem of problems) console.log(`    removed: ${problem}`);
    continue;
  }

  failed = true;
  console.error(`✗ ${name} must install with zero dependencies:`);
  for (const problem of problems) console.error(`    ${problem}`);
}

/**
 * The declared peer ranges are exact strings, not merely present.
 *
 * A peer range is a compatibility promise: `@xyflow/react: "^12.0.0"` says every
 * 12.x works. A bump rewrites it to the version it just installed — `^12.11.5` —
 * and that is a *narrowing*, so a consumer already on 12.4 gets a peer conflict
 * from a release that changed nothing about the code. It recurred in two of the
 * three hand-reverts, and unlike the `dependencies` corruption nothing failed on
 * it: the empty-manifest check only reads the zero-dependency pair, so react's
 * peers were unread by anything and the branch went green.
 *
 * Exact strings rather than a semver "is this at least as wide" comparison. The
 * claim being made is "this is the range we decided on", and every one of these is
 * a deliberate support statement — dropping react 18 is a decision someone makes,
 * not something a range check should quietly ratify because the new range happens
 * to be wider. Widening therefore also fails here, and the fix is to edit this
 * list, exactly as with ALLOWED_RUNTIME_DEPS.
 *
 * `@dialstack/sdk-js` is deliberately absent. Its range tracks our own version
 * (`>=3.1.0 <4` today) and the release tooling rewrites it, so pinning it here
 * would fail every release PR. It is also the one peer a Dependabot npm bump
 * cannot touch, since it names no registry package Dependabot updates.
 */
const PINNED_PEER_RANGES: Record<string, Record<string, string>> = {
  react: {
    '@xyflow/react': '^12.0.0',
    react: '^18 || ^19',
    'react-dom': '^18 || ^19',
  },
};

for (const [name, pinned] of Object.entries(PINNED_PEER_RANGES)) {
  const manifestPath = join(SDK_ROOT, name, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared: Record<string, string> = manifest.peerDependencies ?? {};

  // A missing peer is as wrong as a rewritten one, and worse to debug: the
  // consumer installs cleanly and finds out at runtime. `undefined` reports as
  // "missing" rather than being skipped.
  // Pairs of (dep, what the manifest actually says) — deriving the pair from
  // `pinned` instead would make both sides of every "expected X, found X" message
  // print the same string.
  const drifted = Object.entries(pinned)
    .filter(([dep, range]) => declared[dep] !== range)
    .map(([dep, range]) => ({ dep, found: declared[dep], want: range }));

  if (drifted.length === 0) {
    console.log(`✓ ${name} — ${Object.keys(pinned).length} peer range(s), all as declared`);
    continue;
  }

  // Restore the pinned string. Unlike the dependency repair above, rewriting the
  // value is the whole point: there is no legitimate bump-driven change to a peer
  // range, so whatever is there now is the corruption.
  if (FIX) {
    const lockPeers = lockNode(name)?.peerDependencies as Record<string, string> | undefined;
    manifest.peerDependencies ??= {};
    for (const { dep, want } of drifted) {
      manifest.peerDependencies[dep] = want;
      if (lockPeers) {
        lockPeers[dep] = want;
        lockfileChanged = true;
      }
    }
    writeManifest(manifestPath, manifest);
    console.log(`✓ ${name} — restored ${drifted.length} peer range(s):`);
    for (const { dep, found, want } of drifted) {
      console.log(`    ${dep}: ${found ?? '(missing)'} -> ${want}`);
    }
    continue;
  }

  failed = true;
  console.error(`✗ ${name} declares peer ranges that differ from the ones we support:`);
  for (const { dep, found, want } of drifted) {
    console.error(`    ${dep}: expected ${want}, found ${found ?? '(missing)'}`);
  }
  console.error(
    `    A narrowed range breaks consumers on an older compatible version. If this ` +
      `change is deliberate, update PINNED_PEER_RANGES.`
  );
}

/**
 * The bundled packages' runtime surface is a closed list.
 *
 * `webrtc` and `server` are protected by the empty-manifest check above; `js` and
 * `react` legitimately ship a few dependencies, and "a few" is exactly the state a
 * stray entry hides in. Dependabot has twice appended the sdk tooling root's
 * devDependencies — storybook, eslint, rollup, publint — to these `dependencies`
 * blocks while bumping them, which the empty-manifest check catches for the
 * zero-dependency pair and nothing catches here. A build tool in `dependencies` is
 * a few hundred packages in a consumer's install.
 *
 * Enumerated rather than derived: every entry is a deliberate decision about what a
 * customer installs, so adding one should require editing this list.
 */
const ALLOWED_RUNTIME_DEPS: Record<string, string[]> = {
  js: ['libphonenumber-js'],
  react: ['@dialstack/sdk-webrtc', 'canvas-confetti', 'cmdk', 'dagre', 'libphonenumber-js'],
};

for (const [name, allowed] of Object.entries(ALLOWED_RUNTIME_DEPS)) {
  const manifestPath = join(SDK_ROOT, name, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared = Object.keys(manifest.dependencies ?? {});
  const unexpected = declared.filter((dep) => !allowed.includes(dep));

  if (unexpected.length === 0) {
    console.log(`✓ ${name} — ${declared.length} runtime dependency(ies), all expected`);
    continue;
  }

  // Remove only the unexpected keys. The allowed ones carry real version ranges
  // that a bump is entitled to change, so rewriting the block from the allowlist
  // would revert legitimate updates in the same PR this is repairing.
  if (FIX) {
    const lockDeps = lockNode(name)?.dependencies as Record<string, string> | undefined;
    for (const dep of unexpected) {
      delete manifest.dependencies[dep];
      if (lockDeps && dep in lockDeps) {
        delete lockDeps[dep];
        lockfileChanged = true;
      }
    }
    writeManifest(manifestPath, manifest);
    console.log(`✓ ${name} — removed ${unexpected.length} unexpected runtime dependency(ies):`);
    for (const dep of unexpected) console.log(`    removed: ${dep}`);
    continue;
  }

  failed = true;
  console.error(
    `✗ ${name} declares runtime dependencies that are not on its allowed list:\n` +
      `    ${unexpected.join(', ')}\n` +
      `    If a consumer really should install these, add them to ALLOWED_RUNTIME_DEPS.`
  );
}

// Everything below asserts a property of the *emitted output*, which needs a build.
// `--fix` runs on a bare Dependabot checkout, so stopping here is the difference
// between a repair and seven spurious "no dist/ — build before checking" failures.
if (FIX) {
  // Written once, after both manifest loops, so a lock repair spanning several
  // packages produces a single rewrite. npm's own formatting again — two-space
  // indent, trailing newline — so the diff is only the removed keys.
  if (lockfileChanged) {
    writeManifest(LOCKFILE_PATH, lockfile);
    console.log('✓ package-lock.json — removed the same entries from the sdk/* nodes');
  }
  process.exit(failed ? 1 : 0);
}

/**
 * No emitted bundle may import a stylesheet.
 *
 * Components render into shadow roots, so their CSS has to be compiled in as a
 * string — a document-level stylesheet would not cross the boundary. The rollup
 * configs do that by checking `.css` *before* the external-package match, and the
 * ordering is the whole trick: `@xyflow/react` is external, and a plain
 * name-prefix match would catch `@xyflow/react/dist/style.css` too, leaving a CSS
 * import in the output for the consumer's bundler to resolve.
 *
 * Checked here rather than in lint because it is a property of the build output.
 * In source the import is legitimate — the stylesheet belongs to a declared
 * dependency — so `no-extraneous-dependencies` passes and the bad specifier still
 * reaches dist.
 */
const BUNDLED = ['js', 'react'];
const CSS_IMPORT = /(?:from|import|require\()\s*['"][^'"]+\.css['"]/g;

for (const name of BUNDLED) {
  const distDir = join(SDK_ROOT, name, 'dist');
  if (!existsSync(distDir)) {
    console.error(`✗ ${name}: no dist/ — build before checking emitted output`);
    failed = true;
    continue;
  }

  const offenders: string[] = [];
  let scanned = 0;
  for (const file of readdirSync(distDir)) {
    if (!/\.(mjs|cjs|js)$/.test(file)) continue;
    scanned++;
    const found = readFileSync(join(distDir, file), 'utf8').match(CSS_IMPORT);
    if (found) offenders.push(`${file}: ${[...new Set(found)].join(', ')}`);
  }

  // "Found no stylesheet imports" and "found no bundles" are different results, and
  // only one of them is good news. An existing-but-empty dist/ — a renamed output, a
  // build that half-ran — otherwise printed a tick having read nothing.
  if (scanned === 0) {
    console.error(`✗ ${name}: dist/ contains no .mjs/.cjs/.js bundles — nothing was checked`);
    failed = true;
    continue;
  }

  if (offenders.length === 0) {
    console.log(`✓ ${name} — no stylesheet imports in ${scanned} emitted bundle(s)`);
    continue;
  }
  failed = true;
  console.error(`✗ ${name} emits stylesheet imports, which a consumer cannot resolve:`);
  for (const offender of offenders) console.error(`    ${offender}`);
}

/**
 * The Node client's published declarations must name no sibling package.
 *
 * It shares ~15 button and device types with the browser SDK — the documented wire
 * contract, defined once rather than forked — and names them in `import type` only.
 * Those erase from the JavaScript, but `tsc` keeps them verbatim in the `.d.ts`,
 * where a consumer who installed only this package resolves nothing and every shared
 * type silently degrades to `any`. A rollup-plugin-dts stage inlines the bodies
 * instead.
 *
 * Checked because that stage is what keeps the arrangement reversible. With the
 * bodies inlined, this package's type surface does not depend on where the
 * definitions live, so moving them to a shared package later is an internal
 * refactor a consumer cannot observe. Drop the stage — say, while "simplifying" the
 * build back to plain tsc — and the specifier returns, silently coupling the
 * published types to a package the consumer never installed.
 */
const DECLARATIONS_MUST_BE_SELF_CONTAINED = [
  { pkg: 'server', file: 'index.d.ts', forbidden: '@dialstack/sdk-js' },
];

for (const { pkg, file, forbidden } of DECLARATIONS_MUST_BE_SELF_CONTAINED) {
  const path = join(SDK_ROOT, pkg, 'dist', file);
  if (!existsSync(path)) {
    console.error(`✗ ${pkg}: no dist/${file} — build before checking emitted output`);
    failed = true;
    continue;
  }

  const hits = readFileSync(path, 'utf8')
    .split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => line.includes(forbidden));

  if (hits.length === 0) {
    console.log(`✓ ${pkg} — dist/${file} names no sibling package`);
    continue;
  }
  failed = true;
  console.error(
    `✗ ${pkg}/dist/${file} references ${forbidden}, so a consumer who installed only ` +
      `${pkg} resolves those types as \`any\`:`
  );
  for (const { line, n } of hits.slice(0, 5)) console.error(`    ${file}:${n}  ${line}`);
}

/**
 * No published artifact may name a specifier that no longer resolves.
 *
 * The packages' own doc comments carry `@example` blocks, and rollup-plugin-dts
 * copies them verbatim into the emitted .d.ts — so a stale `@dialstack/sdk/server`
 * is what a customer reads on hover and copies into their editor, where it fails to
 * install. Four of them shipped this way.
 *
 * Checked against dist rather than src on purpose: server's declarations are
 * assembled from several sources, so the specifier can arrive inlined from a file
 * this scan would otherwise never open.
 */
const ALL_PACKAGES = [...DEPENDENCY_FREE, ...BUNDLED];
// The bare name matters as much as its subpaths. `@dialstack/sdk` on its own is the
// retired package, and requiring a `/subpath` let two doc comments reach a published
// .d.ts — they arrived in a merge from main, where the old name is still correct.
// The negative lookahead for `-` keeps the live names (sdk-js, sdk-react, …) out.
const RETIRED_SPECIFIER = /@dialstack\/sdk(?!-)(?:\/[a-z-]+)?/g;

for (const name of ALL_PACKAGES) {
  const distDir = join(SDK_ROOT, name, 'dist');
  // Not `continue`: skipping a missing dist/ silently is how this check would
  // report success on a package that was never built.
  if (!existsSync(distDir)) {
    console.error(`\u2717 ${name}: no dist/ \u2014 build before checking emitted output`);
    failed = true;
    continue;
  }

  const stale: string[] = [];
  let scanned = 0;
  for (const file of readdirSync(distDir)) {
    if (!/\.(d\.ts|d\.cts|mjs|cjs|js)$/.test(file)) continue;
    scanned++;
    const found = readFileSync(join(distDir, file), 'utf8').match(RETIRED_SPECIFIER);
    if (found) stale.push(`${file}: ${[...new Set(found)].join(', ')}`);
  }

  // "Found no retired specifiers" and "opened no files" are different results.
  if (scanned === 0) {
    console.error(`\u2717 ${name}: dist/ contains no emitted files \u2014 nothing was checked`);
    failed = true;
    continue;
  }

  if (stale.length === 0) {
    console.log(`\u2713 ${name} \u2014 no retired specifiers in ${scanned} emitted file(s)`);
    continue;
  }
  failed = true;
  console.error(
    `\u2717 ${name} publishes specifiers that no longer resolve \u2014 a consumer copying them ` +
      `from an editor tooltip cannot install them:`
  );
  for (const s of stale) console.error(`    ${s}`);
}

/**
 * Every published package must carry its own LICENSE.
 *
 * All four declare `"license": "MIT"`, but npm only auto-includes a LICENSE found at
 * the *package* root, and `files: ["dist"]` covers nothing else. Each package root is
 * its own directory, so the one at sdk/ belongs to the private tooling workspace and
 * reached no tarball — all four shipped an MIT claim with no license text.
 */
for (const name of ALL_PACKAGES) {
  const licensePath = join(SDK_ROOT, name, 'LICENSE');
  if (existsSync(licensePath)) {
    console.log(`\u2713 ${name} \u2014 ships a LICENSE`);
    continue;
  }
  failed = true;
  console.error(
    `\u2717 ${name}: no LICENSE at the package root, so the tarball ships none \u2014 ` +
      `npm does not walk up for it, and files: ["dist"] does not cover it`
  );
}

/**
 * The UMD bundle must be entirely self-contained.
 *
 * It is loaded by a `<script>` tag from unpkg, which has no module resolver, so a
 * single bare specifier surviving into it is unresolvable at runtime — and silently
 * so, since nothing in the build fails. `sdk/js/rollup.config.mjs` gives that entry
 * its own `external: () => false` for exactly this reason; this is the assertion that
 * the arrangement still holds. Delete the external override, or add a dependency and
 * forget this one artifact, and the UMD stops working while every other check passes.
 *
 * The charset and the lookbehind are load-bearing, not defensive. Minified output is
 * full of things that read as imports to a naive regex: `.set("from", …)` and
 * `formatFromCell` both match a bare /from\s*['"]/, and a template literal like
 * `@xyflow/${e}/dist/style.css` matches a permissive specifier pattern. Restricting
 * the specifier charset kills the second; requiring that the keyword not follow an
 * identifier character or a dot kills the first. The lookbehind has to be
 * zero-width rather than consuming a character, or a `require(...)` at offset 0
 * would not match.
 */
const SELF_CONTAINED_BUNDLES = [{ pkg: 'js', file: 'dialstack.umd.js' }];

const BARE = String.raw`@?[\w.-]+(?:\/[\w.-]+)*`;
const LEAD = String.raw`(?<![\w$.])`;
const IMPORT_PATTERNS = [
  new RegExp(`${LEAD}from\\s*['"](${BARE})['"]`, 'g'),
  new RegExp(`${LEAD}import\\s*['"](${BARE})['"]`, 'g'),
  new RegExp(`${LEAD}require\\s*\\(\\s*['"](${BARE})['"]\\s*\\)`, 'g'),
  new RegExp(`${LEAD}import\\s*\\(\\s*['"](${BARE})['"]\\s*\\)`, 'g'),
];

for (const { pkg, file } of SELF_CONTAINED_BUNDLES) {
  const path = join(SDK_ROOT, pkg, 'dist', file);
  if (!existsSync(path)) {
    console.error(`\u2717 ${pkg}: no dist/${file} \u2014 build before checking emitted output`);
    failed = true;
    continue;
  }

  const source = readFileSync(path, 'utf8');
  const found = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) found.add(match[1]);
    }
  }

  if (found.size === 0) {
    console.log(`\u2713 ${pkg} \u2014 dist/${file} is self-contained`);
    continue;
  }
  failed = true;
  console.error(
    `\u2717 ${pkg}/dist/${file} names ${found.size} bare specifier(s), which a <script> tag ` +
      `cannot resolve:`
  );
  for (const specifier of [...found].sort()) console.error(`    ${specifier}`);
}

/**
 * The dependency-free packages must emit no bare specifier either.
 *
 * The empty-manifest check above and this one are different claims, and the second is
 * the one that cannot be talked around: a manifest is a promise, while the emitted
 * output is what a consumer's resolver actually follows. `import "cmdk"` added to
 * sdk/webrtc/src/phone.ts satisfies neither — but only this scan sees it, because
 * these two packages build with plain tsc, which leaves imports as imports rather
 * than inlining or erroring on them.
 *
 * Node builtins are allowed: they resolve without an install, so they cost a consumer
 * nothing and do not break the zero-dependency promise.
 *
 * Comments are stripped before matching. Both packages carry `@example` blocks naming
 * packages they deliberately do NOT depend on — sdk/server/src/media-stream.ts:10
 * shows `import { WebSocketServer } from 'ws'` while defining its own minimal
 * WebSocket interface precisely so `ws` is not required — and tsc copies those
 * comments into the emitted .js verbatim. Matching them would report a dependency
 * that does not exist.
 */
const NODE_BUILTIN =
  /^(node:|assert|buffer|crypto|events|fs|http|https|net|os|path|stream|tls|url|util|zlib)$/;
// No leading dot in the charset, so a relative path cannot match.
const BARE_PACKAGE = String.raw`@?[\w-]+(?:\/[\w.-]+)*`;
const EMITTED_IMPORT = [
  new RegExp(`${LEAD}from\\s*['"](${BARE_PACKAGE})['"]`, 'g'),
  new RegExp(`${LEAD}import\\s*['"](${BARE_PACKAGE})['"]`, 'g'),
  new RegExp(`${LEAD}require\\s*\\(\\s*['"](${BARE_PACKAGE})['"]\\s*\\)`, 'g'),
  new RegExp(`${LEAD}import\\s*\\(\\s*['"](${BARE_PACKAGE})['"]\\s*\\)`, 'g'),
];
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

for (const name of DEPENDENCY_FREE) {
  const distDir = join(SDK_ROOT, name, 'dist');
  if (!existsSync(distDir)) {
    console.error(`\u2717 ${name}: no dist/ \u2014 build before checking emitted output`);
    failed = true;
    continue;
  }

  const found = new Set<string>();
  let scanned = 0;
  for (const file of readdirSync(distDir)) {
    if (!/\.(mjs|cjs|js)$/.test(file)) continue;
    scanned++;
    const source = stripComments(readFileSync(join(distDir, file), 'utf8'));
    for (const pattern of EMITTED_IMPORT) {
      for (const match of source.matchAll(pattern)) {
        if (match[1] && !NODE_BUILTIN.test(match[1])) found.add(match[1]);
      }
    }
  }

  if (scanned === 0) {
    console.error(
      `\u2717 ${name}: dist/ contains no emitted JavaScript \u2014 nothing was checked`
    );
    failed = true;
    continue;
  }

  if (found.size === 0) {
    console.log(`\u2713 ${name} \u2014 ${scanned} emitted file(s) import nothing installable`);
    continue;
  }
  failed = true;
  console.error(
    `\u2717 ${name} emits ${found.size} bare specifier(s), so it is not dependency-free ` +
      `regardless of what its manifest says:`
  );
  for (const specifier of [...found].sort()) console.error(`    ${specifier}`);
}

process.exit(failed ? 1 : 0);
