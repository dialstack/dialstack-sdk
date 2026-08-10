/**
 * The manifests of the two zero-dependency packages.
 *
 * Asserted here as well as by `npm run check:deps` so a regression fails the test
 * suite, not only a separate script someone has to remember to run. The check is
 * about what the manifest *declares* — the import side is enforced per file by
 * eslint (import-x/no-extraneous-dependencies, import-x/no-relative-packages).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (pkg: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(__dirname, '..', '..', pkg, 'package.json'), 'utf8'));

describe.each([['webrtc'], ['server']])('@dialstack/sdk-%s', (pkg) => {
  const manifest = read(pkg);

  // The headline promise: installing this package pulls in nothing else. A single
  // entry here is what turned a softphone install into 26 packages.
  it('declares no dependencies', () => {
    expect(manifest['dependencies'] ?? {}).toEqual({});
  });

  // A peer is still an install the consumer has to perform, and it does not appear
  // in `npm ls` the way a dependency does.
  it('declares no peerDependencies', () => {
    expect(manifest['peerDependencies'] ?? {}).toEqual({});
  });

  // Both build with plain tsc rather than a bundler, which is what makes the
  // promise structural: an unbundled per-file emit cannot inline a dependency it
  // failed to declare, so the manifest and the tarball cannot disagree.
  it('builds with tsc, not a bundler', () => {
    expect(manifest['scripts']).toMatchObject({
      build: expect.stringContaining('tsc -p tsconfig.build.json'),
    });
  });
});

describe('@dialstack/sdk-server', () => {
  const manifest = read('server');

  // The shared wire-contract types come from the browser package in `import type`
  // only. Dev, never runtime: the declaration build inlines the type bodies, so a
  // consumer installing only this package still resolves them.
  it('keeps the browser package as a devDependency', () => {
    expect(manifest['devDependencies']).toHaveProperty('@dialstack/sdk-js');
    expect(manifest['dependencies'] ?? {}).not.toHaveProperty('@dialstack/sdk-js');
  });
});

describe('the bundled packages', () => {
  // Components render into shadow roots, so their CSS is compiled in as a string —
  // a document-level stylesheet cannot cross that boundary. The rollup configs
  // achieve it by testing `.css` BEFORE the external-package match, and that
  // ordering is the whole trick: @xyflow/react is external, and a plain name-prefix
  // match catches @xyflow/react/dist/style.css too.
  //
  // Get the order wrong and a CSS import ships to consumers, whose bundler has to
  // resolve it and which would not reach the shadow root anyway. Verified by
  // removing the check and rebuilding: dial-plan.mjs gained
  // `from"@xyflow/react/dist/style.css"`.
  //
  // Asserted on the config rather than on dist/ so it fails without a build; the
  // emitted output is checked by `npm run check:deps`.
  it.each([['js'], ['react']])('%s tests .css before the external-package match', (pkg) => {
    const config = readFileSync(join(__dirname, '..', '..', pkg, 'rollup.config.mjs'), 'utf8');
    const cssCheck = config.indexOf('.css$/.test(id)');
    expect(cssCheck).toBeGreaterThan(-1);

    // Inside the same `external` predicate, nothing may match a package name first.
    const nameMatch = config.indexOf('names.some');
    if (nameMatch > -1) expect(cssCheck).toBeLessThan(nameMatch);
  });
});

describe('@dialstack/sdk-server declaration inlining', () => {
  // The build must keep the rollup-plugin-dts stage after tsc. That stage is what
  // makes sharing the wire-contract types with sdk-js reversible: with the bodies
  // inlined, this package's type surface does not depend on where they are defined,
  // so moving them to a shared package later is invisible to a consumer. Without it,
  // the published .d.ts names a package the consumer never installed and every shared
  // type degrades to `any`.
  //
  // Asserted on the manifest so it fails without a build; `npm run check:deps`
  // asserts the emitted .d.ts itself.
  it('runs the declaration bundler after tsc', () => {
    const manifest = read('server');
    expect(manifest['scripts']).toMatchObject({
      build: expect.stringMatching(/tsc -p tsconfig\.build\.json\s*&&\s*rollup -c/),
    });
  });
});
