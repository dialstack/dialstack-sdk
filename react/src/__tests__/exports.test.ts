/**
 * What each React entry point exposes, and — more importantly — what the root does
 * not.
 *
 * The root deliberately carries no components. A barrel that re-exported them made
 * the whole module graph reachable from any single import, so a softphone-only app
 * pulled the dial-plan editor's @xyflow/react, dagre and cmdk: ~144 KB against
 * ~58 KB when imported directly. If a component reappears on the root, that
 * regression comes back silently — nothing else would fail.
 */

import * as Root from '../index';
import * as Softphone from '../softphone';
import * as DialPlan from '../dial-plan';
import * as Onboarding from '../onboarding';
import * as AIAgent from '../ai-agent';
import * as CallLogs from '../call-logs';
import * as Voicemails from '../voicemails';
import * as CallHistory from '../call-history';
import * as PhoneNumbers from '../phone-numbers';
import * as PhoneNumberOrdering from '../phone-number-ordering';

describe('the shared root entry', () => {
  it.each([
    ['DialstackComponentsProvider'],
    ['useDialstackComponents'],
    ['useDialstack'],
    ['useCreateComponent'],
    ['useUpdateWithSetter'],
    ['useAppearance'],
  ])('exports %s, which every component needs', (name) => {
    expect((Root as Record<string, unknown>)[name]).toBeDefined();
  });

  it.each([
    ['CallLogs'],
    ['Voicemails'],
    ['CallHistory'],
    ['PhoneNumbers'],
    ['PhoneNumberOrdering'],
    ['AIAgent'],
    ['DialPlan'],
    ['Softphone'],
    ['SoftphoneProvider'],
    ['OnboardingPortal'],
  ])('does NOT export %s — it belongs to its own subpath', (name) => {
    expect((Root as Record<string, unknown>)[name]).toBeUndefined();
  });

  // The context object is part of the contract, not an accident: every component
  // subpath imports it from here so one provider serves all of them. Dropping it
  // breaks each subpath at bundle time — spineline's build caught exactly that.
  it('exports the components context the subpaths bind to', () => {
    expect(Root.DialstackComponentsContext).toBeDefined();
  });

  it('exports only hooks, the provider and its context', () => {
    const runtimeNames = Object.keys(Root).filter(
      (k) => typeof (Root as Record<string, unknown>)[k] !== 'undefined'
    );
    const allowed = new Set(['DialstackComponentsProvider', 'DialstackComponentsContext']);
    const unexpected = runtimeNames.filter((n) => !n.startsWith('use') && !allowed.has(n));
    expect(unexpected).toEqual([]);
  });
});

describe('the per-component entries', () => {
  it.each([
    ['softphone', Softphone, 'Softphone'],
    ['softphone', Softphone, 'SoftphoneProvider'],
    ['dial-plan', DialPlan, 'DialPlan'],
    ['onboarding', Onboarding, 'OnboardingPortal'],
    ['ai-agent', AIAgent, 'AIAgent'],
    ['call-logs', CallLogs, 'CallLogs'],
    ['voicemails', Voicemails, 'Voicemails'],
    ['call-history', CallHistory, 'CallHistory'],
    ['phone-numbers', PhoneNumbers, 'PhoneNumbers'],
    ['phone-number-ordering', PhoneNumberOrdering, 'PhoneNumberOrdering'],
  ])('./%s exports %s', (_subpath, mod, name) => {
    expect((mod as Record<string, unknown>)[name]).toBeDefined();
  });

  // The AI-agent form is what consumes these, so they moved out of the browser
  // package to keep its runtime edge to values that survive duplication.
  it('./ai-agent carries the prefill helpers', () => {
    expect(typeof AIAgent.buildAIAgentPrefillFaq).toBe('function');
    expect(typeof AIAgent.shouldApplyPrefillFaq).toBe('function');
  });

  // Exported from both, on purpose: they type a callback a host wires up without
  // necessarily importing the editor itself.
  it('./dial-plan re-exports the resource-listing types', () => {
    const check: DialPlan.ResourceType | undefined = undefined;
    expect(check).toBeUndefined();
  });
});
