import type { BridgeTimers } from '@dialstack/sdk-native';
import { NativeModule, requireNativeModule } from 'expo';

declare class BackgroundTimersModule extends NativeModule<{
  onFire: (event: { id: number }) => void;
}> {
  start(id: number, delayMs: number): void;
  cancel(id: number): void;
}

const native = requireNativeModule<BackgroundTimersModule>('BackgroundTimers');
const callbacks = new Map<number, () => void>();
let nextId = 1;

native.addListener('onFire', ({ id }) => {
  const fn = callbacks.get(id);
  callbacks.delete(id);
  fn?.();
});

/**
 * Timers scheduled natively and delivered to JS as an event. On Android, JS
 * timers stop in an app backgrounded without being killed, but events still
 * arrive, so a wake's deadline set here fires on time.
 */
export const backgroundTimers: BridgeTimers = {
  setTimeout(fn, ms) {
    const id = nextId++;
    callbacks.set(id, fn);
    native.start(id, ms);
    return id;
  },
  clearTimeout(handle) {
    if (typeof handle !== 'number' || !callbacks.delete(handle)) return;
    native.cancel(handle);
  },
};
