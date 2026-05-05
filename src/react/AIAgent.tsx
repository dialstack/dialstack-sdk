/**
 * AIAgent — thin React wrapper around the framework-agnostic
 * `<dialstack-ai-agent>` Custom Element. Mirrors Voicemails.tsx /
 * CallLogs.tsx: useCreateComponent instantiates the element and
 * useUpdateWithSetter forwards each prop to its setter. `onSaved` /
 * `onError` are wired via `addEventListener` on the element's
 * `dialstack:ai-agent:saved` / `:error` events — the same path a non-React
 * host would use — so the wrapper and a plain HTML drop-in stay in sync.
 */

import React, { useEffect } from 'react';

import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateWithSetter } from './useUpdateWithSetter';
import type { AIAgent as AIAgentData } from '../types/ai-agent';
import type { AIAgentField } from '../types/components';
import type { Locale } from '../locales';

export interface AIAgentProps {
  /** AI agent ID (`aia_…`) the host has resolved for the current account. */
  agentId: string;
  /**
   * Fields the editor should not render. Spineline mounts with
   * `hideFields={['name']}` because there is exactly one managed agent per
   * practice and the back-office name is invisible to operators.
   */
  hideFields?: AIAgentField[];
  /** Optional callback invoked after a successful save. */
  onSaved?: (agent: { id: string }) => void;
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

export const AIAgent: React.FC<AIAgentProps> = ({
  agentId,
  hideFields,
  onSaved,
  onError,
  locale,
  className,
  style,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'ai-agent');

  useUpdateWithSetter(componentInstance, agentId, (comp, val) => comp.setAgentId(val));
  useUpdateWithSetter(componentInstance, hideFields ?? EMPTY_HIDE_FIELDS, (comp, val) =>
    comp.setHideFields(val)
  );
  useUpdateWithSetter(componentInstance, locale, (comp, val) => comp.setLocale(val));

  useEffect(() => {
    const el = componentInstance as unknown as EventTarget | null;
    if (!el) return;
    const handleSaved = (e: Event) => {
      const detail = (e as CustomEvent<{ agentId: string }>).detail;
      onSaved?.({ id: detail.agentId });
    };
    const handleError = (e: Event) => {
      const detail = (e as CustomEvent<{ error: Error }>).detail;
      onError?.(detail.error);
    };
    el.addEventListener('dialstack:ai-agent:saved', handleSaved);
    el.addEventListener('dialstack:ai-agent:error', handleError);
    return () => {
      el.removeEventListener('dialstack:ai-agent:saved', handleSaved);
      el.removeEventListener('dialstack:ai-agent:error', handleError);
    };
  }, [componentInstance, onSaved, onError]);

  return <div ref={containerRef} className={className} style={style} />;
};

// Re-exported for consumers that want to type their onSaved callback.
export type { AIAgentData };
