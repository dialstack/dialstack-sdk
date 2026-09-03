import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import replace from '@rollup/plugin-replace';
import pkg from './package.json' with { type: 'json' };

const production = !process.env.ROLLUP_WATCH;

// Import .css files as exported strings, including from node_modules.
//
// This package needs a bundler for exactly this reason: DialPlan renders into a
// shadow root and injects `@xyflow/react`'s stylesheet as a string
// (`stylesheets={dialPlanStylesheets}`). A document-level CSS import by the
// consumer would not cross the shadow boundary, so the text has to be compiled
// in. `tsc` emits no JS for a `.css` module and cannot do this.
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

// Everything declared in package.json stays external, so each dependency lands
// in the consumer's lockfile where `npm audit` can see it. The xyflow JavaScript
// is external too — only its stylesheet is inlined, and the two are separate
// specifiers.
//
// CSS is checked first and never externalized: `@xyflow/react` is external and a
// subpath match would otherwise catch `@xyflow/react/dist/style.css`, emitting a
// CSS import the consumer's bundler would have to resolve.
const names = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];
const external = (id) => {
  if (/\.css$/.test(id)) return false;
  if (/^react(-dom)?(\/.*)?$/.test(id)) return true;
  return names.some((n) => id === n || id.startsWith(`${n}/`));
};

// Resolve the provider to this package's own name and mark it external, so the
// onboarding bundle imports `@dialstack/sdk-react` rather than inlining a second
// copy of the React context. Done in resolveId (not output.paths, which keeps
// rollup's relative-path prefix and emits "./@dialstack/sdk-react").
function providerAsPackageEntry() {
  return {
    name: 'provider-as-package-entry',
    resolveId(source) {
      if (/(^|\/)DialstackComponentsProvider$/.test(source)) {
        return { id: pkg.name, external: true };
      }
      return null;
    },
  };
}

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
    // Declarations come from the dts passes below. Emitting them here produces a
    // dist/index.d.ts that re-exports per-file paths (./react/DialPlan, …) which
    // the bundled output does not contain, so consumers resolve no types at all.
    declaration: false,
    rootDir: 'src',
  }),
  babel({
    babelHelpers: 'bundled',
    exclude: 'node_modules/**',
    presets: [
      ['@babel/preset-env', { targets: { browsers: '> 0.25%, not dead' } }],
      '@babel/preset-typescript',
      ['@babel/preset-react', { runtime: 'automatic' }],
    ],
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  }),
  production && terser(),
];

// One entry per component, plus the shared root. Generated rather than listed so a
// component cannot be added to package.json's exports and silently skipped here —
// the two lists must stay in step, and generating makes that structural.
//
// Every entry except the root runs providerAsPackageEntry, which rewrites the
// provider import to this package's own name and marks it external. Without it each
// bundle inlines its own copy of the components context, so a component cannot see
// the provider the app rendered — a blank render with no error. Check after touching
// this: only dist/index.* may contain a createContext call for that context.
const COMPONENT_ENTRIES = [
  'softphone',
  'dial-plan',
  'onboarding',
  'ai-agent',
  'call-logs',
  'voicemails',
  'call-history',
  'phone-numbers',
  'phone-number-ordering',
];

const js = (name) => ({
  input: `src/${name}.ts`,
  external,
  output: [
    { file: `dist/${name}.cjs`, format: 'cjs', sourcemap: true, exports: 'named' },
    { file: `dist/${name}.mjs`, format: 'esm', sourcemap: true },
  ],
  plugins: name === 'index' ? plugins : [providerAsPackageEntry(), ...plugins],
});

// Flatten each entry's types into one .d.ts following the same graph as the JS, so
// nothing points at a path that exists only in src/.
// Both extensions from one pass — see the same factory in js/rollup.config.mjs for
// why the .d.cts is not redundant: a bare .d.ts in a `"type": "module"` package
// describes ESM types, and pairing those with the .cjs that `require` resolves to
// leaves a typed CommonJS consumer on TS1479.
const types = (name) => ({
  input: `src/${name}.ts`,
  external,
  output: [
    { file: `dist/${name}.d.ts`, format: 'esm' },
    { file: `dist/${name}.d.cts`, format: 'cjs' },
  ],
  plugins:
    name === 'index'
      ? [dts({ tsconfig: './tsconfig.json' })]
      : [providerAsPackageEntry(), dts({ tsconfig: './tsconfig.json' })],
});

const entries = ['index', ...COMPONENT_ENTRIES];
export default [...entries.map(js), ...entries.map(types)];
