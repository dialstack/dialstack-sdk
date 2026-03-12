import { renderOverviewScreen } from '../onboarding-portal/overview-screen';
import { OnboardingProgressStore } from '../account-onboarding/progress-store';
import { SIDEBAR_GROUPS } from '../account-onboarding/constants';
import type { StepName } from '../account-onboarding/progress-store';
import type { PhoneNumberItem } from '../../types';

/** Simple translator — returns the key, except flowsComplete which needs placeholders. */
const t = (key: string) =>
  key === 'onboardingPortal.overview.flowsComplete' ? '{completed} of {total} flows complete' : key;

function createStore(): OnboardingProgressStore {
  const store = new OnboardingProgressStore();
  for (const [step, groups] of Object.entries(SIDEBAR_GROUPS)) {
    store.registerSidebarMapping(step, groups);
  }
  return store;
}

describe('renderOverviewScreen', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('renders all 3 default step cards when no activeSteps provided', () => {
    renderOverviewScreen(container, t, null);
    const cards = container.querySelectorAll('.overview-card');
    expect(cards).toHaveLength(3);
  });

  it('renders only the specified activeSteps', () => {
    const activeSteps: StepName[] = ['account', 'numbers'];
    renderOverviewScreen(container, t, null, activeSteps);
    const cards = container.querySelectorAll('.overview-card');
    expect(cards).toHaveLength(2);

    const btns = container.querySelectorAll('.overview-card-btn');
    expect(btns[0]!.getAttribute('data-step')).toBe('account');
    expect(btns[1]!.getAttribute('data-step')).toBe('numbers');
  });

  it('clears container before rendering', () => {
    const old = document.createElement('p');
    old.textContent = 'old content';
    container.appendChild(old);
    renderOverviewScreen(container, t, null);
    expect(container.querySelector('.overview-container')).not.toBeNull();
    expect(container.textContent).not.toContain('old content');
  });

  describe('progress calculations', () => {
    it('shows 0% aggregate when no progress store', () => {
      renderOverviewScreen(container, t, null);
      const pct = container.querySelector('.overview-progress-pct');
      expect(pct!.textContent).toBe('0%');
    });

    it('calculates aggregate percentage across active steps', () => {
      const store = createStore();
      store.completeSubStep('account', 'business-details');
      store.completeSubStep('account', 'team-members');

      // Only show account step — should be 100%
      renderOverviewScreen(container, t, store, ['account']);
      const pct = container.querySelector('.overview-progress-pct');
      expect(pct!.textContent).toBe('100%');
    });

    it('counts completed flows correctly', () => {
      const store = createStore();
      store.completeSubStep('account', 'business-details');
      store.completeSubStep('account', 'team-members');

      renderOverviewScreen(container, t, store, ['account', 'numbers']);
      const subtitle = container.querySelector('.overview-progress-subtitle');
      // 1 completed out of 2 — the translator returns the key, and
      // {completed}/{total} are replaced with actual values
      expect(subtitle!.textContent).toContain('1');
      expect(subtitle!.textContent).toContain('2');
    });
  });

  describe('completed state', () => {
    it('shows checkmark icon for completed steps', () => {
      const store = createStore();
      store.completeSubStep('account', 'business-details');
      store.completeSubStep('account', 'team-members');

      renderOverviewScreen(container, t, store);
      const icons = container.querySelectorAll('.overview-card-icon');
      expect(icons[0]!.classList.contains('overview-card-icon--complete')).toBe(true);
      expect(icons[0]!.querySelector('svg')).not.toBeNull();
    });

    it('shows "Complete" label for completed steps', () => {
      const store = createStore();
      store.completeSubStep('account', 'business-details');
      store.completeSubStep('account', 'team-members');

      renderOverviewScreen(container, t, store);
      const labels = container.querySelectorAll('.overview-card-progress-label');
      expect(labels[0]!.textContent).toBe('onboardingPortal.overview.complete');
    });

    it('shows percentage label for incomplete steps', () => {
      const store = createStore();
      renderOverviewScreen(container, t, store);
      const labels = container.querySelectorAll('.overview-card-progress-label');
      expect(labels[0]!.textContent).toBe('0%');
    });

    it('does not render duplicate percentage element', () => {
      renderOverviewScreen(container, t, null);
      const pctElements = container.querySelectorAll('.overview-card-progress-pct');
      expect(pctElements).toHaveLength(0);
    });
  });

  describe('accessibility', () => {
    it('sets role="progressbar" on aggregate progress track', () => {
      renderOverviewScreen(container, t, null);
      const track = container.querySelector('.overview-progress-bar-track');
      expect(track!.getAttribute('role')).toBe('progressbar');
      expect(track!.getAttribute('aria-valuemin')).toBe('0');
      expect(track!.getAttribute('aria-valuemax')).toBe('100');
      expect(track!.getAttribute('aria-valuenow')).toBe('0');
    });

    it('sets role="progressbar" on each card progress track', () => {
      const store = createStore();
      store.completeSubStep('account', 'business-details');

      renderOverviewScreen(container, t, store);
      const cardTracks = container.querySelectorAll('.overview-card-progress-track');
      expect(cardTracks).toHaveLength(3);

      for (const track of cardTracks) {
        expect(track.getAttribute('role')).toBe('progressbar');
        expect(track.getAttribute('aria-valuemin')).toBe('0');
        expect(track.getAttribute('aria-valuemax')).toBe('100');
        expect(track.getAttribute('aria-valuenow')).not.toBeNull();
      }
    });

    it('reflects correct aria-valuenow for progress', () => {
      const store = createStore();
      store.completeSubStep('account', 'business-details');
      store.completeSubStep('account', 'team-members');

      renderOverviewScreen(container, t, store, ['account']);
      const track = container.querySelector('.overview-card-progress-track');
      expect(track!.getAttribute('aria-valuenow')).toBe('100');
    });
  });

  describe('phone number status card', () => {
    const makePhone = (overrides: Partial<PhoneNumberItem> = {}): PhoneNumberItem => ({
      phone_number: '+12125551234',
      status: 'ordering',
      outbound_enabled: null,
      source: 'number_order',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...overrides,
    });

    it('does not render when phoneNumbers is undefined', () => {
      renderOverviewScreen(container, t, null);
      expect(container.querySelector('.overview-phone-status')).toBeNull();
    });

    it('does not render when phoneNumbers is empty', () => {
      renderOverviewScreen(container, t, null, undefined, []);
      expect(container.querySelector('.overview-phone-status')).toBeNull();
    });

    it('renders card with title and subtitle', () => {
      renderOverviewScreen(container, t, null, undefined, [makePhone()]);
      const card = container.querySelector('.overview-phone-status');
      expect(card).not.toBeNull();
      expect(card!.querySelector('.overview-phone-status-title')!.textContent).toBe(
        'onboardingPortal.overview.phoneStatusTitle'
      );
      expect(card!.querySelector('.overview-phone-status-subtitle')!.textContent).toBe(
        'onboardingPortal.overview.phoneStatusSubtitle'
      );
    });

    it('renders correct number of rows', () => {
      const phones = [makePhone(), makePhone({ phone_number: '+12125555678' })];
      renderOverviewScreen(container, t, null, undefined, phones);
      const rows = container.querySelectorAll('.overview-phone-status-row');
      expect(rows).toHaveLength(2);
    });

    it('shows "Port" type for port_order source', () => {
      renderOverviewScreen(container, t, null, undefined, [
        makePhone({ source: 'port_order', status: 'porting_submitted' }),
      ]);
      const type = container.querySelector('.overview-phone-status-type');
      expect(type!.textContent).toBe('onboardingPortal.overview.phoneStatusTypePort');
    });

    it('shows "New" type for non-port sources', () => {
      renderOverviewScreen(container, t, null, undefined, [makePhone({ source: 'number_order' })]);
      const type = container.querySelector('.overview-phone-status-type');
      expect(type!.textContent).toBe('onboardingPortal.overview.phoneStatusTypeNew');
    });

    it('shows "Complete" badge for active status', () => {
      renderOverviewScreen(container, t, null, undefined, [
        makePhone({ status: 'active', source: 'did' }),
      ]);
      const badge = container.querySelector('.overview-phone-status-badge');
      expect(badge!.textContent).toBe('onboardingPortal.overview.phoneStatusComplete');
      expect(badge!.classList.contains('overview-phone-status-badge--complete')).toBe(true);
    });

    it('shows "Processing" badge for non-active status', () => {
      renderOverviewScreen(container, t, null, undefined, [makePhone({ status: 'ordering' })]);
      const badge = container.querySelector('.overview-phone-status-badge');
      expect(badge!.textContent).toBe('onboardingPortal.overview.phoneStatusProcessing');
      expect(badge!.classList.contains('overview-phone-status-badge--processing')).toBe(true);
    });

    it('formats E.164 phone numbers to national format', () => {
      renderOverviewScreen(container, t, null, undefined, [makePhone()]);
      const phoneText = container.querySelector('.overview-phone-status-phone-text');
      // +12125551234 → (212) 555-1234
      expect(phoneText!.textContent).toBe('(212) 555-1234');
    });
  });
});
