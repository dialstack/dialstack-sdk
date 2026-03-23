import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { fixupPluginRules } from '@eslint/compat';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import compatPlugin from 'eslint-plugin-compat';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
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
    ignores: ['dist/**', 'node_modules/**', '*.config.js'],
  }
);
