/**
 * OnboardingProgressStore — ephemeral, in-memory projection of onboarding state.
 *
 * Completion is derived from real account data (DIDs, devices, locations, …)
 * via deriveOnboardingState. The store holds that derived snapshot plus the
 * user's current navigation step so the existing portal/step components keep
 * their pub/sub subscription model.
 *
 * It does NOT persist to the database. Substep mutators (completeSubStep,
 * markStepComplete) update the in-memory set for optimistic UI updates after
 * a data write; the next bootstrap re-derives from the source of truth.
 */

import type { AccountOnboardingStep } from '../../types/account-onboarding';
import {
  ONBOARDING_STEPS,
  ORDERED_SUBSTEPS,
  SIDEBAR_GROUPS,
  type StepName,
  type SidebarGroup,
} from './constants';

export type { StepName, SidebarGroup };

export class OnboardingProgressStore {
  private currentStep: AccountOnboardingStep = 'account';
  private completed: Record<StepName, Set<string>> = {
    account: new Set(),
    numbers: new Set(),
    hardware: new Set(),
  };
  private sidebarMappings: Record<string, SidebarGroup[]> = { ...SIDEBAR_GROUPS };
  private listeners = new Set<() => void>();

  // ============================================================================
  // Hydration from derived snapshot
  // ============================================================================

  /**
   * Replace the in-memory completion sets with a freshly derived snapshot.
   * Called by useOnboardingBootstrap after fetching account data. Polls during
   * port/E911 flows keep firing identical snapshots — skip notify when nothing
   * changed so downstream subscribers don't re-render on every reload tick.
   */
  hydrateFromDerived(completed: Record<StepName, Set<string>>): void {
    let changed = false;
    for (const step of ONBOARDING_STEPS) {
      const next = completed[step];
      const prev = this.completed[step];
      if (prev.size !== next.size || ![...next].every((s) => prev.has(s))) {
        this.completed[step] = new Set(next);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  // ============================================================================
  // Step navigation
  // ============================================================================

  setCurrentStep(step: AccountOnboardingStep): void {
    if (this.currentStep === step) return;
    this.currentStep = step;
    this.notify();
  }

  allStepsComplete(): boolean {
    for (const step of ONBOARDING_STEPS) {
      if (!this.isStepComplete(step)) return false;
    }
    return true;
  }

  getCurrentStep(): AccountOnboardingStep {
    return this.currentStep;
  }

  // ============================================================================
  // Substep completion (optimistic local updates)
  // ============================================================================

  completeSubStep(step: StepName, substep: string): void {
    if (this.completed[step].has(substep)) return;
    this.completed[step].add(substep);
    this.notify();
  }

  getCompletedSubSteps(step: StepName): ReadonlySet<string> {
    return this.completed[step];
  }

  // ============================================================================
  // Step completion
  // ============================================================================

  markStepComplete(step: StepName): void {
    const ordered = ORDERED_SUBSTEPS[step];
    if (!ordered) return;
    let changed = false;
    for (const substep of ordered) {
      if (!this.completed[step].has(substep)) {
        this.completed[step].add(substep);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  isStepComplete(step: StepName): boolean {
    const mappings = this.sidebarMappings[step];
    if (!mappings || mappings.length === 0) return false;
    const required = mappings.filter((group) => !group.optional);
    if (required.length === 0) return false;
    return required.every((group) => group.substeps.some((s) => this.completed[step].has(s)));
  }

  // ============================================================================
  // Progress derivation
  // ============================================================================

  getStepProgressPercent(step: StepName): number {
    const mappings = this.sidebarMappings[step];
    if (!mappings || mappings.length === 0) return 0;
    const required = mappings.filter((group) => !group.optional);
    if (required.length === 0) return 0;

    const completedGroups = required.filter((group) =>
      group.substeps.some((s) => this.completed[step].has(s))
    ).length;

    return Math.round((completedGroups / required.length) * 100);
  }

  // ============================================================================
  // Pub/sub
  // ============================================================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
