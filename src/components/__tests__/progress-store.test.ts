import { OnboardingProgressStore } from '../../react/onboarding/progress-store';

function createStore(): OnboardingProgressStore {
  return new OnboardingProgressStore();
}

describe('OnboardingProgressStore', () => {
  describe('initial state', () => {
    it('starts at account step with 0% progress', () => {
      const store = createStore();
      expect(store.getCurrentStep()).toBe('account');
      expect(store.getStepProgressPercent('account')).toBe(0);
      expect(store.getStepProgressPercent('numbers')).toBe(0);
      expect(store.getStepProgressPercent('hardware')).toBe(0);
    });

    it('reports no steps complete', () => {
      const store = createStore();
      expect(store.isStepComplete('account')).toBe(false);
      expect(store.isStepComplete('numbers')).toBe(false);
      expect(store.isStepComplete('hardware')).toBe(false);
    });
  });

  describe('hydrateFromDerived', () => {
    it('replaces in-memory completion sets and notifies listeners', () => {
      const store = createStore();
      const listener = jest.fn();
      store.subscribe(listener);

      store.hydrateFromDerived({
        account: new Set(['business-details', 'team-members']),
        numbers: new Set(['overview']),
        hardware: new Set(),
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.isStepComplete('account')).toBe(true);
      expect(store.isStepComplete('numbers')).toBe(false);
    });

    it('overwrites previous state on re-hydration', () => {
      const store = createStore();
      store.hydrateFromDerived({
        account: new Set(['business-details', 'team-members']),
        numbers: new Set(),
        hardware: new Set(),
      });
      expect(store.isStepComplete('account')).toBe(true);

      store.hydrateFromDerived({
        account: new Set(),
        numbers: new Set(),
        hardware: new Set(),
      });
      expect(store.isStepComplete('account')).toBe(false);
    });
  });

  describe('completeSubStep', () => {
    it('marks a substep complete and updates progress', () => {
      const store = createStore();
      store.completeSubStep('account', 'business-details');

      expect(store.getCompletedSubSteps('account').has('business-details')).toBe(true);
      expect(store.getStepProgressPercent('account')).toBe(50);
    });

    it('does not re-notify when called for an already-completed substep', () => {
      const store = createStore();
      const listener = jest.fn();
      store.subscribe(listener);

      store.completeSubStep('account', 'business-details');
      expect(listener).toHaveBeenCalledTimes(1);

      store.completeSubStep('account', 'business-details');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('markStepComplete', () => {
    it('marks all substeps for a step as complete', () => {
      const store = createStore();
      store.markStepComplete('account');

      expect(store.isStepComplete('account')).toBe(true);
      expect(store.getStepProgressPercent('account')).toBe(100);
    });
  });

  describe('isStepComplete', () => {
    it('returns true when all sidebar groups have at least one completed substep', () => {
      const store = createStore();
      store.completeSubStep('account', 'business-details');
      store.completeSubStep('account', 'team-members');
      expect(store.isStepComplete('account')).toBe(true);
    });

    it('returns false when some sidebar groups are incomplete', () => {
      const store = createStore();
      store.completeSubStep('account', 'business-details');
      expect(store.isStepComplete('account')).toBe(false);
    });
  });

  describe('setCurrentStep', () => {
    it('updates current step and notifies listeners', () => {
      const store = createStore();
      const listener = jest.fn();
      store.subscribe(listener);

      store.setCurrentStep('numbers');
      expect(store.getCurrentStep()).toBe('numbers');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not notify if step unchanged', () => {
      const store = createStore();
      const listener = jest.fn();
      store.subscribe(listener);

      store.setCurrentStep('account');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('returns an unsubscribe function', () => {
      const store = createStore();
      const listener = jest.fn();
      const unsub = store.subscribe(listener);

      store.completeSubStep('account', 'business-details');
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      store.completeSubStep('account', 'team-members');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
