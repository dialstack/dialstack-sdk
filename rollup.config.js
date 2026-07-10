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
    rootDir: 'src',
    exclude: excludeServer ? ['src/server/**'] : [],
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
  // Softphone hooks entry (shared web ↔ RN call-state brain — React + headless
  // core only, NO web component graph, so it's safe to import from React
  // Native). React is external: the consuming app (web or RN) provides it.
  {
    input: 'src/react-softphone.ts',
    external: (id) => /^react(-dom)?$/.test(id),
    output: [
      {
        file: 'dist/react-softphone.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/react-softphone.mjs',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: browserPlugins(),
  },
  // Framework-agnostic softphone design tokens + glyph data (no React, no DOM,
  // no React Native) — published as standalone subpaths so the RN softphone
  // package can import them without pulling any component graph.
  {
    input: 'src/components/softphone-theme.ts',
    external: () => false,
    output: [
      {
        file: 'dist/softphone-theme.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/softphone-theme.mjs',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: browserPlugins(),
  },
  {
    input: 'src/components/softphone-icons.ts',
    external: () => false,
    output: [
      {
        file: 'dist/softphone-icons.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/softphone-icons.mjs',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: browserPlugins(),
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
        // rootDir is `src` (not `src/server`) so the bundle can import the
        // shared auto-pagination helper from src/shared/. Declarations keep
        // their source structure under dist: src/server/index.ts still emits
        // to dist/server/index.d.ts — the package.json types entry point is
        // unchanged; src/shared/*.d.ts lands alongside under dist/shared/.
        declarationDir: 'dist',
        rootDir: 'src',
      }),
    ],
  },
];
