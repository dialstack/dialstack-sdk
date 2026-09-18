// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    /**
     * The OS call library is reachable from exactly one file: the adapter.
     *
     * Everything else talks to the OS through the `OsCallAdapter` port from
     * `@dialstack/sdk-native`, so swapping expo-callkit-telecom for
     * react-native-callkeep is a one-file change. The fence also keeps a
     * second OS-event subscriber from appearing: an earlier version of this
     * app had two (a React controller and a background bridge) and they raced
     * on every answer, each failing the session the other was completing.
     * Most OS call events are not queued, so a second listener can consume a
     * one-shot event the bridge needed rather than merely duplicating work.
     */
    // Every JS/TS file, not just src/**/*.ts: index.js is the one module that runs
    // in BOTH the window and the headless wake runtime, so a stray listener there
    // is live on the hardest path to reproduce. `patterns` also blocks subpaths.
    files: ['**/*.{js,jsx,mjs,ts,tsx}'],
    ignores: ['src/os/expoCallKitTelecomAdapter.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['expo-callkit-telecom', 'expo-callkit-telecom/*'],
              message:
                'Only src/os/expoCallKitTelecomAdapter.ts may import expo-callkit-telecom. Everything else uses the OsCallAdapter port from @dialstack/sdk-native.',
            },
          ],
        },
      ],
    },
  },
]);
