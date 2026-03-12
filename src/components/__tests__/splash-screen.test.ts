import { renderSplashScreen } from '../onboarding-portal/splash-screen';

const t = (key: string) => key;

describe('renderSplashScreen', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('renders splash container', () => {
    renderSplashScreen(container, t);
    expect(container.querySelector('.splash-container')).not.toBeNull();
  });

  it('renders start button with data-action', () => {
    renderSplashScreen(container, t);
    const btn = container.querySelector('[data-action="start-onboarding"]');
    expect(btn).not.toBeNull();
    expect(btn!.tagName).toBe('BUTTON');
  });

  it('renders three step chips', () => {
    renderSplashScreen(container, t);
    const chips = container.querySelectorAll('.splash-chip');
    expect(chips).toHaveLength(3);
  });

  it('renders chip numbers 1, 2, 3', () => {
    renderSplashScreen(container, t);
    const numbers = container.querySelectorAll('.splash-chip-number');
    expect(numbers[0]!.textContent).toBe('1');
    expect(numbers[1]!.textContent).toBe('2');
    expect(numbers[2]!.textContent).toBe('3');
  });

  it('clears container before rendering', () => {
    const old = document.createElement('p');
    old.textContent = 'old';
    container.appendChild(old);
    renderSplashScreen(container, t);
    expect(container.textContent).not.toContain('old');
    expect(container.querySelector('.splash-container')).not.toBeNull();
  });

  it('renders illustration and plant SVGs', () => {
    renderSplashScreen(container, t);
    expect(container.querySelector('.splash-visual')).not.toBeNull();
    expect(container.querySelector('.splash-plant')).not.toBeNull();
  });
});
