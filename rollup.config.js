import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import pkg from './package.json' with { type: 'json' };

const production = !process.env.ROLLUP_WATCH;

// Shared plugins for browser builds
const browserPlugins = (excludeServer = true) => [
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
    external: ['react', 'react-dom'],
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
    external: ['react', 'react-dom'],
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
  // Server SDK (Node.js)
  {
    input: 'src/server/index.ts',
    external: [],
    output: {
      file: 'dist/server/index.js',
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
        declarationDir: 'dist/server',
        rootDir: 'src/server',
      }),
    ],
  },
];
