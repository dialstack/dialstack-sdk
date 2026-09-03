import { fileURLToPath } from 'node:url';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

// The shared headless core is authored once in the web package (`sdk/src`) and
// published there only as an internal source; it is NOT a public subpath of
// `@dialstack/sdk-react` — deliberately absent from its exports map. This RN package
// inlines its own compiled copy of the core so it stays self-contained: a consumer
// installs `@dialstack/sdk-native` alone, with no runtime dependency on any sibling.
// The specifier below is what
// the source still writes (`import … from '@dialstack/sdk-react/core'`); we map
// it to the core's source entry so rollup pulls the graph in and bundles it.
// The core's *own* type imports (@dialstack/sdk-webrtc, @dialstack/sdk-js,
// @dialstack/sdk-js/pure) have to resolve too, and they are mapped in
// tsconfig.json rather than here — this package is not an npm workspace, so
// there is no node_modules link to the siblings and rollup-plugin-dts would
// silently leave them as *external* imports in dist/index.d.ts. That publishes
// a package whose public types (Call, CallState, PlatformStorage,
// DialStackPhone) cannot be resolved by any consumer, since neither sibling is
// a dependency or a peer.
//
// Those three map to the siblings' BUILT declarations, not their source, for
// two reasons: source drags the browser custom elements into this package's
// typecheck, where they fail (sdk/js compiles with types: ["node", "jest"],
// this package with types: [], so the DOM-iterable augmentation is missing);
// and the raw source index does not re-export everything the core imports —
// `Locale` only reaches the public surface once rollup-plugin-dts flattens it.
// So `npm run build --prefix sdk` has to run before this package builds.
const CORE_SPECIFIER = '@dialstack/sdk-react/core';
const CORE_SOURCE = fileURLToPath(new URL('../react/src/react/softphone/core/index.ts', import.meta.url));

function inlineCore() {
  return {
    name: 'inline-shared-core',
    resolveId(source) {
      if (source === CORE_SPECIFIER) return CORE_SOURCE;
      return null;
    },
  };
}

// Everything the RN app supplies (peer deps) or that is host-provided stays
// external — only the DialStack source graph is inlined.
const external = (id) =>
  /^react(-dom|\/jsx-runtime|\/jsx-dev-runtime)?$/.test(id) ||
  /^react-native($|\/|-)/.test(id) ||
  id === 'libphonenumber-js' ||
  id.startsWith('libphonenumber-js/');

export default [
  {
    input: 'src/index.ts',
    external,
    output: {
      file: 'dist/index.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      inlineCore(),
      resolve({ extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        sourceMap: true,
        // Declarations are emitted by the dts stage below, not here.
        declaration: false,
        declarationMap: false,
      }),
    ],
  },
  // Self-contained type bundle: rollup-plugin-dts follows the same graph through
  // the core inline mapping and flattens it into one `dist/index.d.ts` with no
  // dangling `@dialstack/sdk-react/core` specifier (which plain tsc cannot do).
  {
    input: 'src/index.ts',
    external,
    output: {
      file: 'dist/index.d.ts',
      format: 'esm',
    },
    plugins: [inlineCore(), dts({ tsconfig: './tsconfig.build.json' })],
  },
];
