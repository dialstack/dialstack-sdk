/**
 * AIAgent — thin React wrapper around the framework-agnostic
 * `<dialstack-ai-agent>` Custom Element. Mirrors Voicemails.tsx /
 * CallLogs.tsx: useCreateComponent instantiates the element and
 * useUpdateWithSetter forwards each prop to its setter. `onSaved` /
 * `onError` are wired via `addEventListener` on the element's
 * `dialstack:ai-agent:saved` / `:error` events — the same path a non-React
 * host would use — so the wrapper and a plain HTML drop-in stay in sync.
 */

import React, { useEffect, useLayoutEffect } from 'react';

import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import type {
  AIAgent as AIAgentData,
  AIAgentExtensionAvailabilityResult,
  AIAgentFormValues,
  AIAgentHostCreateResult,
  AIAgentHostSubmitPayload,
} from '../types/ai-agent';
import type { AIAgentField } from '../types/components';
import type { Locale } from '../locales';

export interface AIAgentProps {
  /** AI agent ID (`aia_…`) the host has resolved for the current account. */
  agentId?: string;
  /** Render an existing agent editor or a host-controlled create form. */
  mode?: 'edit' | 'create';
  /** Initial form values for host-controlled create/edit surfaces. */
  initialValues?: AIAgentFormValues;
  /** Host-provided webhook secret to display in full admin-style surfaces. */
  secret?: string | null;
  /**
   * Fields the editor should not render. Spineline mounts with
   * `hideFields={['name']}` because there is exactly one managed agent per
   * practice and the back-office name is invisible to operators.
   */
  hideFields?: AIAgentField[];
  /** Optional callback invoked after a successful save. */
  onSaved?: (agent: { id: string }) => void;
  /** Host-controlled create callback. When set, the component does not call the API itself. */
  onCreateRequested?: (
    payload: AIAgentHostSubmitPayload
  ) => AIAgentHostCreateResult | Promise<AIAgentHostCreateResult>;
  /** Host-controlled save callback. When set, the component does not call the API itself. */
  onSaveRequested?: (payload: AIAgentHostSubmitPayload) => void | Promise<void>;
  /** Host-controlled extension availability callback for privileged extension surfaces. */
  onCheckExtensionAvailability?: (
    extensionNumber: string
  ) => AIAgentExtensionAvailabilityResult | Promise<AIAgentExtensionAvailabilityResult>;
  /** Host-controlled secret rotation callback. */
  onRotateSecretRequested?: () => void | Promise<void>;
  /** Optional callback invoked after a successful host-controlled create. */
  onCreated?: (agent: AIAgentHostCreateResult) => void;
  /** Optional callback invoked when the load or save call rejects. */
  onError?: (error: Error) => void;
  /** Optional locale for translatable strings (labels, placeholders, errors). */
  locale?: Locale;
  /** Optional className applied to the container element. */
  className?: string;
  /** Optional inline styles applied to the container element. */
  style?: React.CSSProperties;
}

// Stable empty reference: lets `<AIAgent />` reset hideFields to "show
// everything" after a previous render passed a non-empty array.
// useUpdateWithSetter skips when value is undefined; a sentinel `[]` makes
// the reset declarative.
const EMPTY_HIDE_FIELDS: AIAgentField[] = [];
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function useLayoutUpdateWithSetter<T extends HTMLElement, V>(
  component: T | null,
  value: V | undefined,
  onUpdated: (component: T, value: V) => void
): void {
  useIsomorphicLayoutEffect(() => {
    if (!component || value === undefined) return;

    try {
      onUpdated(component, value);
    } catch (error) {
      console.error('DialStack: Error calling setter:', error);
    }
  }, [component, value, onUpdated]);
}

export const AIAgent: React.FC<AIAgentProps> = ({
  agentId,
  mode = 'edit',
  initialValues,
  secret,
  hideFields,
  onSaved,
  onCreateRequested,
  onSaveRequested,
  onCheckExtensionAvailability,
  onRotateSecretRequested,
  onCreated,
  onError,
  locale,
  className,
  style,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'ai-agent');
  const submitMode: 'sdk' | 'host' =
    mode === 'create' || onCreateRequested || onSaveRequested ? 'host' : 'sdk';

  useLayoutUpdateWithSetter(componentInstance, mode, (comp, val) => comp.setMode(val));
  useLayoutUpdateWithSetter(componentInstance, submitMode, (comp, val) => comp.setSubmitMode(val));
  useLayoutUpdateWithSetter(componentInstance, initialValues, (comp, val) =>
    comp.setInitialValues(val)
  );
  useLayoutUpdateWithSetter(componentInstance, secret, (comp, val) => comp.setSecret(val));
  useLayoutUpdateWithSetter(componentInstance, onCreateRequested, (comp, val) =>
    comp.setOnCreateRequested(val)
  );
  useLayoutUpdateWithSetter(componentInstance, onSaveRequested, (comp, val) =>
    comp.setOnSaveRequested(val)
  );
  useLayoutUpdateWithSetter(componentInstance, onCheckExtensionAvailability, (comp, val) =>
    comp.setOnCheckExtensionAvailability(val)
  );
  useLayoutUpdateWithSetter(componentInstance, onRotateSecretRequested, (comp, val) =>
    comp.setOnRotateSecretRequested(val)
  );
  useLayoutUpdateWithSetter(componentInstance, agentId, (comp, val) => comp.setAgentId(val));
  useLayoutUpdateWithSetter(componentInstance, hideFields ?? EMPTY_HIDE_FIELDS, (comp, val) =>
    comp.setHideFields(val)
  );
  useLayoutUpdateWithSetter(componentInstance, locale, (comp, val) => comp.setLocale(val));

  useEffect(() => {
    const el = componentInstance as unknown as EventTarget | null;
    if (!el) return;
    const handleSaved = (e: Event) => {
      const detail = (e as CustomEvent<{ agentId: string }>).detail;
      onSaved?.({ id: detail.agentId });
    };
    const handleCreated = (e: Event) => {
      const detail = (e as CustomEvent<AIAgentHostCreateResult>).detail;
      onCreated?.(detail);
    };
    const handleError = (e: Event) => {
      const detail = (e as CustomEvent<{ error: Error }>).detail;
      onError?.(detail.error);
    };
    el.addEventListener('dialstack:ai-agent:saved', handleSaved);
    el.addEventListener('dialstack:ai-agent:created', handleCreated);
    el.addEventListener('dialstack:ai-agent:error', handleError);
    return () => {
      el.removeEventListener('dialstack:ai-agent:saved', handleSaved);
      el.removeEventListener('dialstack:ai-agent:created', handleCreated);
      el.removeEventListener('dialstack:ai-agent:error', handleError);
    };
  }, [componentInstance, onSaved, onCreated, onError]);

  return <div ref={containerRef} className={className} style={style} />;
};

// Re-exported for consumers that want to type their onSaved callback.
export type { AIAgentData };
