import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';

const production = !process.env.ROLLUP_WATCH;

export default [
  // Browser SDK
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
    plugins: [
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
        exclude: ['src/server/**'],
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
    ],
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
