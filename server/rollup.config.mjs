import dts from 'rollup-plugin-dts';
import typescript from '@rollup/plugin-typescript';

// Declarations only. The JavaScript is emitted by `tsc` (see the build script):
// one file per source file, imports left as imports, which is what lets a consumer
// tree-shake this package and what keeps it installable with no runtime
// dependencies at all.
//
// The declarations cannot ship that way. This package names @dialstack/sdk-js in
// `import type` for the button and device shapes it shares with the browser SDK —
// the documented wire contract, which must not fork into two copies that drift.
// Those imports erase from the .js, but `tsc` keeps them verbatim in the .d.ts, so
// a consumer who installed only this package resolves nothing there and every
// shared type silently degrades to `any`.
//
// rollup-plugin-dts follows the same graph and inlines the type bodies, so the
// emitted .d.ts is self-contained: one source of truth for the contract, no
// install-time edge, and types that actually resolve. @dialstack/sdk-js stays a
// devDependency — it is needed to build, never to install.
//
// Only Node builtins stay external. @dialstack/sdk-js must NOT — inlining its type
// bodies is the entire point of this stage, and externalising it would emit the same
// dangling import `tsc` already produces.
const NODE_BUILTINS = /^(node:|crypto$|events$|fs$|path$|http$|https$|stream$|url$|util$|buffer$|tls$|net$|zlib$)/;

export default [
  // Both extensions from this one pass. The .d.cts is not a duplicate: the package
  // is `"type": "module"`, so TypeScript reads a bare .d.ts as ESM types, and pairing
  // those with the CommonJS entry that `require` resolves to is what attw calls
  // "masquerading as ESM" — a typed CJS consumer gets TS1479 rather than types. The
  // extension is the only thing that says which module system a declaration
  // describes.
  {
    input: 'src/index.ts',
    external: (id) => NODE_BUILTINS.test(id),
    output: [
      { file: 'dist/index.d.ts', format: 'esm' },
      { file: 'dist/index.d.cts', format: 'cjs' },
    ],
    plugins: [dts({ tsconfig: './tsconfig.build.json' })],
  },
  // A CommonJS build alongside the per-file ESM `tsc` emits.
  //
  // Before the split this package shipped both formats, so dropping CJS would take
  // a capability away from consumers who never asked for it — `require()` of an
  // ESM-only package throws ERR_REQUIRE_ESM on any Node without unflagged
  // require(esm) (< 20.19). The ESM path stays per-file, because that is what keeps
  // the package tree-shakeable; only the CJS path is bundled, since CommonJS cannot
  // be tree-shaken anyway and a single file avoids shipping a parallel tree of
  // .cjs modules.
  //
  // Same external rule as above: only Node builtins. @dialstack/sdk-js is type-only
  // here, so nothing of it survives into the JavaScript.
  {
    input: 'src/index.ts',
    external: (id) => NODE_BUILTINS.test(id),
    output: { file: 'dist/index.cjs', format: 'cjs', exports: 'named' },
    // Declarations are the other build's job; this one emits JavaScript only.
    // declarationMap and composite have to go too, or the plugin demands an outDir
    // for the declaration files it is not being asked to write.
    plugins: [
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: false,
        declarationMap: false,
        composite: false,
      }),
    ],
  },
];
