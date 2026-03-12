/**
 * OnboardingProgressStore — single source of truth for onboarding progress.
 *
 * Holds completed substeps per step, derives sidebar progress percentages,
 * and syncs to the DB on every mutation (fire-and-forget).
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

export interface OnboardingProgress {
  current_step?: AccountOnboardingStep;
  account?: string[];
  numbers?: string[];
  hardware?: string[];
}

export class OnboardingProgressStore {
  private currentStep: AccountOnboardingStep = 'account';
  private completed: Record<StepName, Set<string>> = {
    account: new Set(),
    numbers: new Set(),
    hardware: new Set(),
  };
  private sidebarMappings: Record<string, SidebarGroup[]> = { ...SIDEBAR_GROUPS };
  private listeners = new Set<() => void>();
  private syncFn: ((progress: OnboardingProgress) => void) | null;

  constructor(syncFn?: (progress: OnboardingProgress) => void) {
    this.syncFn = syncFn ?? null;
  }

  // ============================================================================
  // Hydration
  // ============================================================================

  /**
   * Hydrate from DB payload. Handles both old string format and new array format.
   */
  hydrate(progress: OnboardingProgress | OldFormatProgress | undefined): void {
    if (!progress) return;

    if (progress.current_step && progress.current_step !== ('complete' as string)) {
      this.currentStep = progress.current_step;
    }

    for (const step of ONBOARDING_STEPS) {
      const value = progress[step];
      if (value == null) continue;

      if (Array.isArray(value)) {
        // New format: string[]
        this.completed[step] = new Set(value);
      } else {
        // Old format: single string — convert
        this.completed[step] = this.migrateOldFormat(step, value);
      }
    }
  }

  private migrateOldFormat(step: StepName, value: string): Set<string> {
    const ordered = ORDERED_SUBSTEPS[step];
    if (!ordered) return new Set();

    if (value === 'complete') {
      return new Set(ordered);
    }

    // Mark everything before `value` as complete
    const set = new Set<string>();
    for (const substep of ordered) {
      if (substep === value) break;
      set.add(substep);
    }
    return set;
  }

  // ============================================================================
  // Step navigation
  // ============================================================================

  setCurrentStep(step: AccountOnboardingStep): void {
    if (this.currentStep === step) return;
    if (this.currentStep === 'final_complete') return;
    this.currentStep = step;
    if (step !== 'final_complete') {
      this.persist();
    }
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
  // Substep completion
  // ============================================================================

  completeSubStep(step: StepName, substep: string): void {
    if (this.completed[step].has(substep)) return;
    this.completed[step].add(substep);
    this.persist();
    this.notify();
  }

  removeSubSteps(step: StepName, substeps: string[]): void {
    let changed = false;
    for (const substep of substeps) {
      if (this.completed[step].delete(substep)) {
        changed = true;
      }
    }
    if (changed) {
      this.persist();
      this.notify();
    }
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
    if (changed) {
      this.persist();
      this.notify();
    }
  }

  isStepComplete(step: StepName): boolean {
    const mappings = this.sidebarMappings[step];
    if (!mappings || mappings.length === 0) return false;
    return mappings.every((group) => group.substeps.some((s) => this.completed[step].has(s)));
  }

  // ============================================================================
  // Progress derivation
  // ============================================================================

  getStepProgressPercent(step: StepName): number {
    const mappings = this.sidebarMappings[step];
    if (!mappings || mappings.length === 0) return 0;

    const completedGroups = mappings.filter((group) =>
      group.substeps.some((s) => this.completed[step].has(s))
    ).length;

    return Math.round((completedGroups / mappings.length) * 100);
  }

  // ============================================================================
  // Sidebar mapping registration
  // ============================================================================

  registerSidebarMapping(step: StepName, groups: SidebarGroup[]): void {
    this.sidebarMappings[step] = groups;
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

  // ============================================================================
  // DB persistence
  // ============================================================================

  toDbModel(): OnboardingProgress {
    return {
      current_step: this.allStepsComplete()
        ? ('complete' as AccountOnboardingStep)
        : this.currentStep,
      account: [...this.completed.account],
      numbers: [...this.completed.numbers],
      hardware: [...this.completed.hardware],
    };
  }

  private persist(): void {
    this.syncFn?.(this.toDbModel());
  }
}

/**
 * Old DB format where each step is a single string (or null).
 * Kept for hydration backward-compat only.
 */
interface OldFormatProgress {
  current_step?: AccountOnboardingStep;
  account?: string | null;
  numbers?: string | null;
  hardware?: string | null;
}
