import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

// A CommonJS build alongside the per-file ESM that `tsc` emits (see the build
// script). Both formats ship, as they did before the packages were split apart:
// dropping CJS would take a capability away from consumers who never asked for it,
// and `require()` of an ESM-only package throws ERR_REQUIRE_ESM on any Node without
// unflagged require(esm) (< 20.19). @dialstack/sdk-react's CJS softphone bundle
// require()s this package, so that failure was reachable from a supported Node.
//
// Only the CJS path is bundled. The ESM path stays one file per source file, which
// is what lets a consumer tree-shake this package — the reason it builds with plain
// tsc rather than a bundler. CommonJS cannot be tree-shaken anyway, so a single
// file is strictly better there than a parallel tree of .cjs modules.
//
// Nothing is external: this package imports no runtime dependency at all, which is
// the contract check:deps asserts on its manifest.
export default [
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.cjs', format: 'cjs', exports: 'named' },
    // The per-file .d.ts come from tsc; this build emits JavaScript only.
    // declarationMap and composite have to be off too, or the plugin demands an
    // output directory for declaration files it is not being asked to write.
    plugins: [
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: false,
        declarationMap: false,
        composite: false,
      }),
    ],
  },
  // A .d.cts to pair with the .cjs above. tsc emits `dist/index.d.ts`, but this
  // package is `"type": "module"`, so TypeScript reads that as ESM types — pairing
  // them with the CommonJS entry `require` resolves to is what attw calls
  // "masquerading as ESM", and a typed CJS consumer gets TS1479 rather than working
  // types. The extension is the only signal of which module system a declaration
  // describes, so the flattened CJS declaration has to be emitted separately.
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.d.cts', format: 'cjs' },
    plugins: [dts({ tsconfig: './tsconfig.build.json' })],
  },
];
