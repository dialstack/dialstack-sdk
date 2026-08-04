import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import pkg from './package.json' with { type: 'json' };

const production = !process.env.ROLLUP_WATCH;

// Inline plugin: import .css files as exported strings
// When bundleNodeModulesCss is true, also inlines CSS from node_modules
function cssRawPlugin({ bundleNodeModulesCss = false } = {}) {
  return {
    name: 'css-raw',
    async load(id) {
      if (!id.endsWith('.css')) return null;
      if (id.includes('node_modules') && !bundleNodeModulesCss) return null;
      const fs = await import('node:fs/promises');
      const content = await fs.readFile(id, 'utf-8');
      return `export default ${JSON.stringify(content)};`;
    },
  };
}

// Sources live in per-audience trees (src/, webrtc/src, …), so the TypeScript
// plugin's rootDir has to span the whole package — a narrower one rejects any
// file outside it. That makes declarations land one level deep, under
// dist/src/**, while package.json "exports" names dist/index.d.ts and friends.
// Strip the leading src/ back off so the published type paths are unchanged;
// the per-audience trees keep their own prefix (dist/webrtc/src/**), which
// nothing external references.
//
// Hoisting the file also has to rewrite the specifiers inside it. A declaration
// emitted at dist/src/react.d.ts reaches a sibling tree as '../react/src/x';
// once the file moves up to dist/react.d.ts that same specifier escapes dist/
// entirely and lands on the .tsx source. Consumers then get types pointing
// outside the tarball, and in-repo typechecks (admin) follow the reference into
// raw SDK source and fail on things dist/ never exposes. Re-anchor to './'.
const SIBLING_TREES = ['js', 'react', 'webrtc', 'server'];

function flattenSrcDeclarations() {
  // Matches a specifier that climbs out of the file's own directory to reach a
  // sibling tree, capturing the leading `../` run so one level can be dropped.
  const climbing = new RegExp(
    `(['"])((?:\\.\\./)+)(${SIBLING_TREES.join('|')})/src/`,
    'g'
  );
  // Same for a .d.ts.map's "sources", which point back at the original .ts.
  const climbingSources = /((?:\.\.\/)+)(src\/)/g;
  return {
    name: 'flatten-src-declarations',
    generateBundle(_options, bundle) {
      for (const [fileName, file] of Object.entries(bundle)) {
        if (!fileName.startsWith('src/')) continue;
        if (!/\.d\.ts(\.map)?$/.test(fileName)) continue;
        if (typeof file.source === 'string') {
          // Hoisting the file up one directory means every specifier that
          // climbed out of it needs exactly one fewer `../`. A single remaining
          // `../` becomes `./` so the path stays explicitly relative.
          file.source = file.source
            .replace(climbing, (_m, q, ups, tree) => {
              const levels = ups.length / '../'.length - 1;
              return `${q}${levels === 0 ? './' : '../'.repeat(levels)}${tree}/src/`;
            })
            .replace(climbingSources, (_m, ups, tail) => {
              const levels = ups.length / '../'.length - 1;
              return `${levels === 0 ? '' : '../'.repeat(levels)}${tail}`;
            });
        }
        delete bundle[fileName];
        file.fileName = fileName.slice('src/'.length);
        bundle[file.fileName] = file;
      }
    },
  };
}

// Shared plugins for browser builds
const browserPlugins = ({ excludeServer = true, bundleNodeModulesCss = false } = {}) => [
  cssRawPlugin({ bundleNodeModulesCss }),
  replace({
    preventAssignment: true,
    values: {
      _NPM_PACKAGE_VERSION_: JSON.stringify(pkg.version),
    },
  }),
  resolve({
    browser: true,
    preferBuiltins: false,
  }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    sourceMap: true,
    inlineSources: !production,
    declaration: true,
    declarationDir: 'dist',
    rootDir: '.',
    exclude: excludeServer ? ['src/server/**', 'server/src/**'] : [],
  }),
  flattenSrcDeclarations(),
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

export default [
  // Browser SDK (with side effects - auto-registers components)
  {
    input: 'src/index.ts',
    external: (id) =>
      /^react(-dom)?$/.test(id) || (/\.css$/.test(id) && id.includes('node_modules')),
    output: [
      {
        file: 'dist/sdk.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/sdk.mjs',
        format: 'esm',
        sourcemap: true,
      },
      {
        file: 'dist/sdk.umd.js',
        format: 'umd',
        name: 'DialStack',
        sourcemap: true,
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    ],
    plugins: browserPlugins(),
  },
  // Pure SDK (no side effects - for SSR/testing)
  {
    input: 'src/pure.ts',
    external: (id) =>
      /^react(-dom)?$/.test(id) || (/\.css$/.test(id) && id.includes('node_modules')),
    output: [
      {
        file: 'dist/pure.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
        inlineDynamicImports: true,
      },
      {
        file: 'dist/pure.mjs',
        format: 'esm',
        sourcemap: true,
        inlineDynamicImports: true,
      },
    ],
    plugins: browserPlugins(),
  },
  // React entry (all React components — bundles @xyflow/react, dagre)
  {
    input: 'src/react.ts',
    external: (id) => /^react(-dom)?$/.test(id),
    output: [
      {
        file: 'dist/react.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/react.mjs',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: browserPlugins({ bundleNodeModulesCss: true }),
  },
  // Onboarding entry (native React onboarding portal — bundles canvas-confetti, libphonenumber-js)
  // @dialstack/sdk/react is external so the onboarding bundle shares the same
  // React context as the react bundle (avoids duplicate createContext).
  {
    input: 'src/onboarding.ts',
    external: (id) => /^react(-dom)?$/.test(id) || /^@dialstack\/sdk/.test(id),
    output: [
      {
        file: 'dist/onboarding.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/onboarding.mjs',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: browserPlugins({ bundleNodeModulesCss: true }),
  },
  // WebRTC client SDK (browser, no React)
  {
    input: 'src/webrtc/index.ts',
    external: () => false,
    output: [
      {
        file: 'dist/webrtc.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/webrtc.mjs',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: browserPlugins(),
  },
  // Server SDK (Node.js)
  {
    input: 'src/server/index.ts',
    external: [],
    output: {
      // `dir` + entryFileNames (rather than `file`) emits the same
      // dist/server/index.js while letting declarationDir sit at `dist`
      // (the typescript plugin requires declarationDir inside the output
      // directory).
      dir: 'dist',
      entryFileNames: 'server/index.js',
      format: 'esm',
      sourcemap: true,
      exports: 'named',
    },
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          _NPM_PACKAGE_VERSION_: JSON.stringify(pkg.version),
        },
      }),
      typescript({
        tsconfig: './tsconfig.json',
        sourceMap: true,
        declaration: true,
        // rootDir spans the package so the bundle can import both the shared
        // auto-pagination helper and the per-audience trees. Declarations keep
        // their source structure under dist and flattenSrcDeclarations() strips
        // the src/ prefix, so src/server/index.ts still emits to
        // dist/server/index.d.ts — the package.json types entry is unchanged.
        declarationDir: 'dist',
        rootDir: '.',
      }),
      flattenSrcDeclarations(),
    ],
  },
];
