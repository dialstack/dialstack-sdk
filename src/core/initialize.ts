/**
 * DialStack SDK initialization
 *
 * This is the standard entry point that auto-registers Web Components.
 * For SSR/testing without side effects, use '@dialstack/sdk/pure' instead.
 */

// Import components to ensure they self-register (browser-guarded internally)
import '../components/call-logs';
import '../components/voicemails';
import '../components/call-history';
import '../components/phone-number-ordering';
import '../components/phone-numbers';

// Re-export everything from the pure module
// The only difference is that importing this module registers components as a side effect
export { loadDialstackAndInitialize } from './initialize-pure';
