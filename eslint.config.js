import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { fixupPluginRules } from '@eslint/compat';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import compatPlugin from 'eslint-plugin-compat';
import importPlugin from 'eslint-plugin-import-x';
import globals from 'globals';

// Each package publishes separately, so an import that leaves its own tree is a
// packaging bug rather than a style preference. Two rules cover it, and they are
// scoped per package because "which dependencies are allowed" differs by package.
//
// (eslint-plugin-import-x rather than eslint-plugin-import: the original peers on
// eslint <=9 and this repo is on 10.)
// `inlinesDeclarations` replaces an earlier `dependencyFree` flag, which conflated
// two unrelated things and opened a hole. A dependency-free package has an empty
// manifest, so *every* bare import is undeclared and includeTypes would flag even
// the intended ones — true for server, which names @dialstack/sdk-js in
// `import type` and has a rollup-plugin-dts stage that inlines those bodies, so the
// specifier never reaches a consumer. webrtc has no such stage: tsc leaves its
// declarations per-file, and an undeclared type import there emits a .d.ts naming a
// package the consumer never installed. It imports no bare specifier at all today,
// so the check costs nothing and catches exactly that.
const packageBoundaries = (dir, { inlinesDeclarations = false } = {}) => ({
  files: [`${dir}/src/**/*.{ts,tsx}`],
  plugins: { 'import-x': importPlugin },
  settings: {
    'import-x/resolver': { typescript: { project: `${dir}/tsconfig.json` } },
  },
  rules: {
    // A relative path that climbs into a sibling package. For the tsc-built
    // packages the emitted path would point outside the published tarball; for the
    // bundled ones it silently inlines a second copy of the sibling.
    'import-x/no-relative-packages': 'error',
    // One import statement per module. The split collapsed several deep paths into a
    // single package specifier, so files that legitimately had four imports now have
    // four from the same place — which reads as an oversight and makes it hard to see
    // at a glance what a module actually takes from a package.
    //
    // `prefer-inline` keeps type and value imports in one statement using the inline
    // `type` modifier, rather than the two-statement form the base ESLint rule
    // settles for. Auto-fixable: `npm run lint:fix --prefix sdk`.
    'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
    // Everything imported has to be declared. includeTypes matters here: `import
    // type` erases at runtime, but the emitted .d.ts still names the package, so an
    // undeclared one leaves a consumer's types unresolvable. devDependencies are
    // allowed only where they cannot reach the published output.
    'import-x/no-extraneous-dependencies': [
      'error',
      {
        // Globs match the file's own path, which eslint reports absolute, so these
        // are unanchored. Tests, mocks and stories are excluded from every
        // package's build, so nothing they import can reach a published tarball.
        devDependencies: [
          '**/__tests__/**',
          '**/__mocks__/**',
          '**/__stories__/**',
          '**/__storybook__/**',
          '**/__test-helpers__/**',
          '**/*.test.{ts,tsx}',
          '**/*.stories.{ts,tsx}',
        ],
        optionalDependencies: false,
        peerDependencies: true,
        includeTypes: !inlinesDeclarations,
        // Both manifests: the package's own declares what ships, and the tooling
        // root declares the test and storybook packages every package's suite
        // shares. Listing only the package would flag every test file; listing only
        // the root would let a genuine undeclared runtime dependency through.
        packageDir: [dir, '.'],
      },
    ],
  },
});

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'js/src/**/*.{ts,tsx}', 'react/src/**/*.{ts,tsx}', 'webrtc/src/**/*.{ts,tsx}', 'server/src/**/*.{ts,tsx}'],
    plugins: {
      react: fixupPluginRules(reactPlugin),
      'react-hooks': fixupPluginRules(reactHooksPlugin),
      compat: compatPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'compat/compat': 'warn',
    },
  },
  {
    // React components must be declared as `const X: React.FC<…> = () => {}`, never
    // `export function X()`. TypeDoc buckets exports by JS construct: a `const`
    // component lands under "Components & variables" in the SDK reference, a `function`
    // lands under "Functions" — mixing the two scatters components across two doc
    // sections. Enforcing arrow form also keeps one declaration style across the tree.
    files: ['src/**/*.tsx', 'js/src/**/*.tsx', 'react/src/**/*.tsx'],
    rules: {
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
    },
  },
  {
    // React Native entry (`@dialstack/sdk/native`). Same TS/React rules, but it
    // targets React Native, not the browser: drop the browser globals, and relax
    // two of the newest react-hooks rules that flag idiomatic RN patterns —
    // `useRef(new Animated.Value(…)).current` (the standard Animated idiom) trips
    // `react-hooks/refs`, and resetting local input state when the active call
    // changes trips `react-hooks/set-state-in-effect`. Neither is a defect here.
    files: ['native/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals['shared-node-browser'],
      },
    },
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // Only server gets includeTypes off, and only because its declaration build
  // inlines the browser package's type bodies — see packageBoundaries above.
  packageBoundaries('js'),
  packageBoundaries('react'),
  packageBoundaries('webrtc'),
  packageBoundaries('server', { inlinesDeclarations: true }),
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', '*/dist/**'],
  }
);
