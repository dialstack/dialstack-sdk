/**
 * `check-dependency-free.ts --fix`, the write path.
 *
 * The read path is asserted by dependency-free.test.ts against the real
 * manifests; this pins what the repair *writes*, which nothing else covers. Two
 * claims matter and neither is visible from the checker's exit code:
 *
 *   1. The repair is byte-exact. Its output is a commit pushed onto a Dependabot
 *      PR, so a stray reformat of a 1 MB lockfile or of a manifest turns a
 *      one-line review into an unreviewable diff.
 *   2. It removes only the corruption. A bump legitimately changes the version
 *      ranges of the allowed runtime dependencies in the same PR, so rewriting
 *      those blocks from the allowlist would revert the very update being
 *      repaired.
 *
 * Run against a throwaway copy of the real files (four manifests + the root
 * lockfile), corrupted exactly the way npm's workspace-save bug corrupts them:
 * the bumped tooling appended to `dependencies` everywhere, plus the peer and
 * optional fields the zero-dependency pair also has to be clean of.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import ts from 'typescript';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const PACKAGES = ['js', 'react', 'server', 'webrtc'] as const;
// What a bump appends: the sdk tooling root's devDependencies, which are not
// dependencies of any published package.
const CORRUPTION = { eslint: '^10.9.1', jest: '^30.0.0', rollup: '^4.0.0' };

const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');
const readJSON = (root: string, path: string) => JSON.parse(read(root, path));
const writeJSON = (root: string, path: string, value: unknown): void =>
  writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);

// The script under test is a `.ts` file run directly by `node` (see the sdk
// `check:deps` script and the repair workflow), which needs Node's type stripping
// — 22.18+, per sdk/package.json's `engines`. This suite also runs under Node 20,
// where that spawn dies with ERR_UNKNOWN_FILE_EXTENSION, so type-strip it here
// and spawn the `.mjs` result. Types-only erasure, so it's still the same script.
const SCRIPT = 'sdk/scripts/check-dependency-free.mjs';

let workspace: string;

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'sdk-manifest-repair-'));
  mkdirSync(join(workspace, 'sdk', 'scripts'), { recursive: true });
  writeFileSync(
    join(workspace, SCRIPT),
    ts.transpileModule(read(REPO_ROOT, 'sdk/scripts/check-dependency-free.ts'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
    }).outputText
  );
  cpSync(join(REPO_ROOT, 'package-lock.json'), join(workspace, 'package-lock.json'));
  for (const pkg of PACKAGES) {
    mkdirSync(join(workspace, 'sdk', pkg), { recursive: true });
    cpSync(
      join(REPO_ROOT, 'sdk', pkg, 'package.json'),
      join(workspace, 'sdk', pkg, 'package.json')
    );
  }
});

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe('--fix', () => {
  it('restores manifests and lockfile byte-identically', () => {
    const pristine = new Map<string, string>(
      [...PACKAGES.map((pkg) => `sdk/${pkg}/package.json`), 'package-lock.json'].map((path) => [
        path,
        read(workspace, path),
      ])
    );

    for (const pkg of PACKAGES) {
      const path = `sdk/${pkg}/package.json`;
      const manifest = readJSON(workspace, path);
      manifest.dependencies = { ...(manifest.dependencies ?? {}), ...CORRUPTION };
      // The fields npm also writes into, and which the zero-dependency pair
      // promises are absent entirely.
      if (pkg === 'webrtc') manifest.peerDependencies = { ...CORRUPTION };
      if (pkg === 'server') manifest.optionalDependencies = { ...CORRUPTION };
      // The other half of the corruption, and the half that used to go green:
      // a bump rewrites the peer range to the version it installed, narrowing
      // it. Nothing read react's peers before PINNED_PEER_RANGES.
      if (pkg === 'react') manifest.peerDependencies['@xyflow/react'] = '^12.11.5';
      writeJSON(workspace, path, manifest);
    }

    const lockfile = readJSON(workspace, 'package-lock.json');
    for (const pkg of PACKAGES) {
      const node = lockfile.packages[`sdk/${pkg}`];
      node.dependencies = { ...(node.dependencies ?? {}), ...CORRUPTION };
    }
    lockfile.packages['sdk/react'].peerDependencies['@xyflow/react'] = '^12.11.5';
    writeJSON(workspace, 'package-lock.json', lockfile);

    execFileSync(process.execPath, [join(workspace, SCRIPT), '--fix'], {
      encoding: 'utf8',
    });

    for (const [path, content] of pristine) {
      expect(read(workspace, path)).toBe(content);
    }
  });

  it('keeps a legitimate version bump of an allowed dependency', () => {
    const path = 'sdk/js/package.json';
    const manifest = readJSON(workspace, path);
    manifest.dependencies = { 'libphonenumber-js': '^1.99.0', ...CORRUPTION };
    writeJSON(workspace, path, manifest);

    execFileSync(process.execPath, [join(workspace, SCRIPT), '--fix'], {
      encoding: 'utf8',
    });

    expect(readJSON(workspace, path).dependencies).toEqual({ 'libphonenumber-js': '^1.99.0' });
  });

  it('restores a peer range that was widened, not just one that was narrowed', () => {
    // The claim is "this is the range we decided on". A wider range is still a
    // support statement nobody made, so it is repaired rather than ratified —
    // otherwise the check would quietly bless dropping a supported major.
    const path = 'sdk/react/package.json';
    const manifest = readJSON(workspace, path);
    manifest.peerDependencies['@xyflow/react'] = '>=11';
    writeJSON(workspace, path, manifest);

    execFileSync(process.execPath, [join(workspace, SCRIPT), '--fix'], { encoding: 'utf8' });

    expect(readJSON(workspace, path).peerDependencies['@xyflow/react']).toBe('^12.0.0');
  });

  it('leaves the release-managed sibling peer range alone', () => {
    // `@dialstack/sdk-js` tracks our own version and the release tooling rewrites
    // it, so pinning it would fail every release PR. It is deliberately not in
    // PINNED_PEER_RANGES, and the repair must not invent a value for it.
    const path = 'sdk/react/package.json';
    const manifest = readJSON(workspace, path);
    manifest.peerDependencies['@dialstack/sdk-js'] = '>=4.0.0 <5';
    manifest.peerDependencies['@xyflow/react'] = '^12.11.5';
    writeJSON(workspace, path, manifest);

    execFileSync(process.execPath, [join(workspace, SCRIPT), '--fix'], { encoding: 'utf8' });

    const repaired = readJSON(workspace, path).peerDependencies;
    expect(repaired['@dialstack/sdk-js']).toBe('>=4.0.0 <5');
    expect(repaired['@xyflow/react']).toBe('^12.0.0');
  });

  it('leaves the workspace members real devDependencies in the lockfile', () => {
    // The corruption only ever lands in dependency-shaped fields; sdk/js and
    // sdk/react really do declare rollup-plugin-dts, and the repair must not
    // reach for it.
    const nodes = readJSON(workspace, 'package-lock.json').packages;
    expect(nodes['sdk/js'].devDependencies).toHaveProperty('rollup-plugin-dts');
    expect(nodes['sdk/server'].devDependencies).toHaveProperty('@dialstack/sdk-js');
  });
});
