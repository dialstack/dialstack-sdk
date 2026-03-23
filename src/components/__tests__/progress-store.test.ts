import { OnboardingProgressStore } from '../../react/onboarding/progress-store';
import { SIDEBAR_GROUPS } from '../../react/onboarding/constants';

function createStore(syncFn?: (p: unknown) => void): OnboardingProgressStore {
  const store = new OnboardingProgressStore(syncFn);
  for (const [step, groups] of Object.entries(SIDEBAR_GROUPS)) {
    store.registerSidebarMapping(step, groups);
  }
  return store;
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

  describe('hydrate', () => {
    it('hydrates from new array format', () => {
      const store = createStore();
      store.hydrate({
        current_step: 'numbers',
        account: ['business-details', 'team-members'],
        numbers: ['overview'],
      });

      expect(store.getCurrentStep()).toBe('numbers');
      expect(store.isStepComplete('account')).toBe(true);
      expect(store.getStepProgressPercent('account')).toBe(100);
      expect(store.getStepProgressPercent('numbers')).toBe(20);
    });

    it('hydrates from old string format', () => {
      const store = createStore();
      store.hydrate({
        current_step: 'account',
        account: 'team-members' as unknown as string[],
        numbers: null as unknown as string[],
      });

      expect(store.getCurrentStep()).toBe('account');
      // Old format: 'team-members' → everything before it (business-details) is complete
      expect(store.getCompletedSubSteps('account').has('business-details')).toBe(true);
      expect(store.getCompletedSubSteps('account').has('team-members')).toBe(false);
      expect(store.getStepProgressPercent('account')).toBe(50);
    });

    it('hydrates old "complete" string as all substeps done', () => {
      const store = createStore();
      store.hydrate({
        current_step: 'numbers',
        account: 'complete' as unknown as string[],
      });

      expect(store.isStepComplete('account')).toBe(true);
      expect(store.getStepProgressPercent('account')).toBe(100);
    });

    it('ignores "complete" current_step from DB (wahoo screen is transient)', () => {
      const store = createStore();
      store.hydrate({
        current_step: 'complete' as never,
        account: ['business-details', 'team-members'],
        numbers: ['overview'],
      });

      // Should NOT hydrate to final_complete — defaults to 'account'
      expect(store.getCurrentStep()).toBe('account');
      // But substep data is still hydrated
      expect(store.isStepComplete('account')).toBe(true);
    });

    it('handles undefined progress', () => {
      const store = createStore();
      store.hydrate(undefined);
      expect(store.getCurrentStep()).toBe('account');
      expect(store.getStepProgressPercent('account')).toBe(0);
    });
  });

  describe('completeSubStep', () => {
    it('marks a substep complete and updates progress', () => {
      const store = createStore();
      store.completeSubStep('account', 'business-details');

      expect(store.getCompletedSubSteps('account').has('business-details')).toBe(true);
      expect(store.getStepProgressPercent('account')).toBe(50);
    });

    it('does not double-count already completed substeps', () => {
      const syncFn = jest.fn();
      const store = createStore(syncFn);
      store.completeSubStep('account', 'business-details');
      const callCount = syncFn.mock.calls.length;

      store.completeSubStep('account', 'business-details');
      // Should not trigger another sync
      expect(syncFn.mock.calls.length).toBe(callCount);
    });
  });

  describe('removeSubSteps', () => {
    it('removes substeps and reverts progress', () => {
      const syncFn = jest.fn();
      const store = createStore(syncFn);
      store.completeSubStep('numbers', 'overview');
      store.completeSubStep('numbers', 'port-numbers');
      expect(store.getStepProgressPercent('numbers')).toBe(40);

      syncFn.mockClear();
      store.removeSubSteps('numbers', ['port-numbers']);
      expect(store.getStepProgressPercent('numbers')).toBe(20);
      expect(syncFn).toHaveBeenCalledTimes(1);
    });

    it('does nothing when substeps are not present', () => {
      const syncFn = jest.fn();
      const store = createStore(syncFn);
      store.completeSubStep('numbers', 'overview');
      syncFn.mockClear();

      store.removeSubSteps('numbers', ['port-numbers']);
      expect(syncFn).not.toHaveBeenCalled();
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

  describe('persist payload promotes to complete', () => {
    it('does not change in-memory currentStep when all steps complete', () => {
      const store = createStore();
      store.setCurrentStep('hardware');
      store.markStepComplete('account');
      store.markStepComplete('numbers');
      store.markStepComplete('hardware');

      // In-memory stays on the current step (for UI "All Done!" screen)
      expect(store.getCurrentStep()).toBe('hardware');
    });

    it('persist payload includes current_step "complete" via markStepComplete', () => {
      const syncFn = jest.fn();
      const store = createStore(syncFn);
      store.markStepComplete('account');
      store.markStepComplete('numbers');
      syncFn.mockClear();

      store.markStepComplete('hardware');
      expect(syncFn).toHaveBeenCalledTimes(1);
      expect(syncFn.mock.calls[0]![0].current_step).toBe('complete');
    });

    it('persist payload includes current_step "complete" via completeSubStep', () => {
      const syncFn = jest.fn();
      const store = createStore(syncFn);
      store.markStepComplete('account');
      store.markStepComplete('numbers');
      store.completeSubStep('hardware', 'device-assignment');
      syncFn.mockClear();

      store.completeSubStep('hardware', 'final-completion');
      expect(syncFn).toHaveBeenCalledTimes(1);
      expect(syncFn.mock.calls[0]![0].current_step).toBe('complete');
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

    it('works for numbers step with multi-substep groups', () => {
      const store = createStore();
      // Complete one substep from each group
      store.completeSubStep('numbers', 'overview');
      store.completeSubStep('numbers', 'primary-did');
      store.completeSubStep('numbers', 'caller-id');
      store.completeSubStep('numbers', 'order-search');
      store.completeSubStep('numbers', 'order-status');
      expect(store.isStepComplete('numbers')).toBe(true);
    });
  });

  describe('getStepProgressPercent', () => {
    it('returns percentage based on completed sidebar groups', () => {
      const store = createStore();
      // Numbers has 5 groups: options, primary-did, caller-id, setup, verification
      store.completeSubStep('numbers', 'overview'); // options group
      expect(store.getStepProgressPercent('numbers')).toBe(20);

      store.completeSubStep('numbers', 'order-search'); // setup group
      expect(store.getStepProgressPercent('numbers')).toBe(40);

      store.completeSubStep('numbers', 'order-status'); // verification group
      expect(store.getStepProgressPercent('numbers')).toBe(60);
    });

    it('returns 0 for step with no sidebar mappings', () => {
      const store = new OnboardingProgressStore();
      expect(store.getStepProgressPercent('account')).toBe(0);
    });
  });

  describe('setCurrentStep', () => {
    it('updates current step and persists', () => {
      const syncFn = jest.fn();
      const store = createStore(syncFn);
      store.setCurrentStep('numbers');

      expect(store.getCurrentStep()).toBe('numbers');
      expect(syncFn).toHaveBeenCalled();
      expect(syncFn.mock.calls[0][0].current_step).toBe('numbers');
    });

    it('does not persist if step unchanged', () => {
      const syncFn = jest.fn();
      const store = createStore(syncFn);
      store.setCurrentStep('account'); // already 'account'
      expect(syncFn).not.toHaveBeenCalled();
    });

    it('sets final_complete in memory but does not persist', () => {
      const syncFn = jest.fn();
      const store = createStore(syncFn);
      store.markStepComplete('account');
      store.markStepComplete('numbers');
      store.markStepComplete('hardware');
      syncFn.mockClear();

      store.setCurrentStep('final_complete');
      expect(store.getCurrentStep()).toBe('final_complete');
      // Should NOT persist — final_complete is purely visual
      expect(syncFn).not.toHaveBeenCalled();
    });

    it('allows stepping back from final_complete to a regular step (review mode)', () => {
      const syncFn = jest.fn();
      const store = createStore(syncFn);
      store.markStepComplete('account');
      store.markStepComplete('numbers');
      store.markStepComplete('hardware');
      store.setCurrentStep('final_complete');
      syncFn.mockClear();

      store.setCurrentStep('numbers');
      expect(store.getCurrentStep()).toBe('numbers');
      expect(syncFn).toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on changes', () => {
      const store = createStore();
      const listener = jest.fn();
      store.subscribe(listener);

      store.completeSubStep('account', 'business-details');
      expect(listener).toHaveBeenCalledTimes(1);

      store.setCurrentStep('numbers');
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('returns unsubscribe function', () => {
      const store = createStore();
      const listener = jest.fn();
      const unsub = store.subscribe(listener);

      store.completeSubStep('account', 'business-details');
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      store.completeSubStep('account', 'team-members');
      expect(listener).toHaveBeenCalledTimes(1); // no new call
    });
  });

  describe('toDbModel', () => {
    it('serializes completed substeps as arrays', () => {
      const store = createStore();
      store.setCurrentStep('numbers');
      store.completeSubStep('account', 'business-details');
      store.completeSubStep('account', 'team-members');
      store.completeSubStep('numbers', 'overview');

      const model = store.toDbModel();
      expect(model.current_step).toBe('numbers');
      expect(model.account).toEqual(['business-details', 'team-members']);
      expect(model.numbers).toEqual(['overview']);
      expect(model.hardware).toEqual([]);
    });
  });

  describe('DB sync', () => {
    it('calls syncFn on every mutation', () => {
      const syncFn = jest.fn();
      const store = createStore(syncFn);

      store.completeSubStep('account', 'business-details');
      expect(syncFn).toHaveBeenCalledTimes(1);

      store.setCurrentStep('numbers');
      expect(syncFn).toHaveBeenCalledTimes(2);

      store.markStepComplete('account');
      expect(syncFn).toHaveBeenCalledTimes(3);
    });
  });
});
