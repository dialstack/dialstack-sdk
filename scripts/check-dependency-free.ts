#!/usr/bin/env node
/**
 * Claims the published packages make that no lint rule can express.
 *
 *   npm run check:deps --prefix sdk
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
 *   2. No emitted bundle may import a stylesheet.
 *   3. The Node client's declarations must name no sibling package.
 *   4. No published artifact may name a retired `@dialstack/sdk/*` specifier.
 *   5. Every package must ship a LICENSE.
 *   6. The UMD bundle must be entirely self-contained.
 *   7. The dependency-free packages must emit no bare specifier.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
  failed = true;
  console.error(`✗ ${name} must install with zero dependencies:`);
  for (const problem of problems) console.error(`    ${problem}`);
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
  const manifest = JSON.parse(readFileSync(join(SDK_ROOT, name, 'package.json'), 'utf8'));
  const declared = Object.keys(manifest.dependencies ?? {});
  const unexpected = declared.filter((dep) => !allowed.includes(dep));

  if (unexpected.length === 0) {
    console.log(`✓ ${name} — ${declared.length} runtime dependency(ies), all expected`);
    continue;
  }
  failed = true;
  console.error(
    `✗ ${name} declares runtime dependencies that are not on its allowed list:\n` +
      `    ${unexpected.join(', ')}\n` +
      `    If a consumer really should install these, add them to ALLOWED_RUNTIME_DEPS.`
  );
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
