/**
 * React hook for synchronizing React props to Web Component setter methods
 *
 * This hook provides type-safe synchronization of React props to imperative
 * Web Component APIs.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Hook that synchronizes a React prop value to a Web Component setter method
 *
 * This enables declarative React patterns (props) to control imperative
 * Web Component APIs (setter methods) in a type-safe way.
 *
 * The setter runs only when the component or the value changes, compared by
 * identity like React's own effect deps, so a host that re-renders often
 * doesn't make the element re-render or reload.
 * That makes two things part of the contract:
 * - `onUpdated` must depend only on `component` and `value`. A setter closing
 *   over other state isn't re-run when only that state changes; pass it in
 *   `value` instead.
 * - Keep object props stable (a constant, `useMemo`, state) and replace rather
 *   than mutate them: an inline `{…}` is a new value on every render, and a
 *   value mutated in place is the same one.
 *
 * @param component - The Web Component instance (or null if not mounted)
 * @param value - The prop value to sync
 * @param onUpdated - Callback that receives the component and value, should call the setter
 *
 * @example
 * ```tsx
 * const Voicemails = ({ userId, onVoicemailSelect }) => {
 *   const { containerRef, componentInstance } = useCreateComponent(dialstack, 'voicemails');
 *
 *   // Type-safe: TypeScript knows componentInstance has setUserId method
 *   useUpdateWithSetter(componentInstance, userId, (comp, val) => {
 *     comp.setUserId(val);
 *   });
 *
 *   // A callback: removing the prop clears it on the element.
 *   useUpdateHandlerWithSetter(componentInstance, onVoicemailSelect, (comp, val) => {
 *     comp.setOnVoicemailSelect(val);
 *   });
 *
 *   return <div ref={containerRef} />;
 * };
 * ```
 */
export function useUpdateWithSetter<T extends HTMLElement, V>(
  component: T | null,
  value: V | undefined,
  onUpdated: (component: T, value: V) => void
): void {
  const applied = useRef<Applied<T> | null>(null);
  // No deps: wrappers pass the setter inline, so it is new every render.
  // applyIfChanged decides whether the element hears about it.
  useEffect(() => applyIfChanged(applied, component, value, onUpdated));
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * `useUpdateWithSetter` in a layout effect, for an element whose first paint
 * must already reflect its props. Same contract.
 */
export function useLayoutUpdateWithSetter<T extends HTMLElement, V>(
  component: T | null,
  value: V | undefined,
  onUpdated: (component: T, value: V) => void
): void {
  const applied = useRef<Applied<T> | null>(null);
  useIsomorphicLayoutEffect(() => applyIfChanged(applied, component, value, onUpdated));
}

/**
 * `useUpdateWithSetter` for a callback prop: when the host stops passing it,
 * the setter is called once with `undefined`, so the element stops calling a
 * handler the host has let go of. Other props keep their last value instead,
 * since clearing them would need a per-setter reset to defaults.
 */
export function useUpdateHandlerWithSetter<T extends HTMLElement, H>(
  component: T | null,
  handler: H | undefined,
  onUpdated: (component: T, handler: H | undefined) => void
): void {
  const applied = useRef<Applied<T> | null>(null);
  useEffect(() => applyIfChanged(applied, component, handler, onUpdated, true));
}

/** `useUpdateHandlerWithSetter` in a layout effect. */
export function useLayoutUpdateHandlerWithSetter<T extends HTMLElement, H>(
  component: T | null,
  handler: H | undefined,
  onUpdated: (component: T, handler: H | undefined) => void
): void {
  const applied = useRef<Applied<T> | null>(null);
  useIsomorphicLayoutEffect(() => applyIfChanged(applied, component, handler, onUpdated, true));
}

interface Applied<T> {
  component: T;
  value: unknown;
}

function applyIfChanged<T extends HTMLElement, V>(
  applied: { current: Applied<T> | null },
  component: T | null,
  value: V | undefined,
  onUpdated: (component: T, value: V) => void,
  clearOnRemove = false
): void {
  if (!component) return;
  const last = applied.current;
  const sameComponent = last !== null && last.component === component;
  if (value === undefined) {
    // Only a value that was applied and is now gone needs clearing.
    if (!clearOnRemove || !sameComponent || last.value === undefined) return;
  } else if (sameComponent && Object.is(last.value, value)) {
    return;
  }

  // Recorded even when the setter throws, so a bad value is reported once
  // rather than on every host render.
  applied.current = { component, value };
  try {
    onUpdated(component, value as V);
  } catch (error) {
    console.error('DialStack: Error calling setter:', error);
  }
}
