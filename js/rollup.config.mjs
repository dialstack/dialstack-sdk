import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import pkg from './package.json' with { type: 'json' };

const production = !process.env.ROLLUP_WATCH;

// The components import their own stylesheets and pass them into shadow roots as
// strings, so the CSS has to be compiled in. `tsc` emits no JS for a .css module.
function cssRawPlugin() {
  return {
    name: 'css-raw',
    async load(id) {
      if (!id.endsWith('.css')) return null;
      const fs = await import('node:fs/promises');
      return `export default ${JSON.stringify(await fs.readFile(id, 'utf-8'))};`;
    },
  };
}

// Declared dependencies stay external so they land in the consumer's lockfile.
// CSS is never external — see cssRawPlugin.
const names = Object.keys(pkg.dependencies ?? {});
const external = (id) => {
  if (/\.css$/.test(id)) return false;
  return names.some((n) => id === n || id.startsWith(`${n}/`));
};

const plugins = [
  cssRawPlugin(),
  replace({
    preventAssignment: true,
    values: { _NPM_PACKAGE_VERSION_: JSON.stringify(pkg.version) },
  }),
  resolve({ browser: true, preferBuiltins: false }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    sourceMap: true,
    inlineSources: !production,
    // Declarations come from the dts passes below; a per-file emit here would
    // re-export paths that only exist in src/.
    declaration: false,
    rootDir: 'src',
  }),
  production && terser(),
];

// `dir` + entryFileNames rather than `file`, and NOT inlineDynamicImports.
//
// registerComponents() in the pure entry loads the components through dynamic
// `import()` precisely so that importing this module registers nothing — that is
// the entry's whole contract, and what makes it usable for SSR and tests.
// Inlining those dynamic imports hoists the component modules to module scope,
// where their `customElements.define` calls run at load time and silently break
// it. Emitting chunks keeps the lazy boundary intact.
const entry = (name) => ({
  input: `src/${name}.ts`,
  external,
  output: [
    {
      dir: 'dist',
      entryFileNames: `${name}.cjs`,
      chunkFileNames: `${name}-[name]-[hash].cjs`,
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    {
      dir: 'dist',
      entryFileNames: `${name}.mjs`,
      chunkFileNames: `${name}-[name]-[hash].mjs`,
      format: 'esm',
      sourcemap: true,
    },
  ],
  plugins,
});

// Declarations in both extensions, from one pass: rollup-plugin-dts emits the same
// text either way, so this is two outputs rather than two builds.
//
// The .d.cts is not redundant. The package is `"type": "module"`, so TypeScript reads
// a bare .d.ts as ESM types — and pairing those with the CommonJS .cjs that `require`
// resolves to is what attw calls "masquerading as ESM": a typed CJS consumer gets
// TS1479 and cannot `require()` this package at all, even though the JavaScript runs
// fine. The extension is the only thing that tells TypeScript which module system a
// declaration describes.
const types = (name) => ({
  input: `src/${name}.ts`,
  external,
  output: [
    { file: `dist/${name}.d.ts`, format: 'esm' },
    { file: `dist/${name}.d.cts`, format: 'cjs' },
  ],
  plugins: [dts({ tsconfig: './tsconfig.json' })],
});

// The self-contained <script> bundle, served by unpkg. A script tag has no module
// resolver, so nothing may stay external here — not even libphonenumber-js, which
// the npm entries above leave as a bare import so it reaches the consumer's
// lockfile. This entry therefore has its own `external` (nothing) rather than
// sharing the one above, because rollup applies `external` per entry, not per
// output.
//
// This bundle used to ship from @dialstack/sdk. That package is no longer
// published, so the documented URL moved here:
//   https://unpkg.com/@dialstack/sdk-js
// The old URL keeps resolving to @dialstack/sdk@1.2.0 forever — npm never removes
// published versions — so existing script tags keep working; switching to this one
// is how a consumer starts receiving fixes again.
const umd = {
  input: 'src/index.ts',
  external: () => false,
  output: {
    file: 'dist/dialstack.umd.js',
    format: 'umd',
    name: 'DialStack',
    sourcemap: true,
  },
  plugins,
};

export default [entry('index'), entry('pure'), umd, types('index'), types('pure')];
