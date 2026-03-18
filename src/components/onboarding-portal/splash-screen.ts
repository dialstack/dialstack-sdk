import {
  SPLASH_BG_SHAPE_SVG,
  SPLASH_ILLUSTRATION_SVG,
  SPLASH_PLANT_SVG,
} from './splash-illustration';
import { ARROW_RIGHT_SVG } from './constants';

export interface SplashScreenOptions {
  logoHtml?: string;
}

function renderSplashContent(t: (key: string) => string): string {
  return `<div class="splash-content">
    <h1 class="splash-title">${t('onboardingPortal.splash.title')}</h1>
    <p class="splash-subtitle">${t('onboardingPortal.splash.subtitle')}</p>
    <button class="splash-btn" data-action="start-onboarding">
      <span>${t('onboardingPortal.splash.start')}</span>
      <span>${ARROW_RIGHT_SVG}</span>
    </button>
  </div>`;
}

function renderSplashChips(t: (key: string) => string): string {
  const chipLabels = [
    t('onboardingPortal.splash.step1'),
    t('onboardingPortal.splash.step2'),
    t('onboardingPortal.splash.step3'),
  ];
  return `<div class="splash-chips">
    ${chipLabels
      .map(
        (label, i) => `<div class="splash-chip">
      <div class="splash-chip-number">${i + 1}</div>
      <span class="splash-chip-label">${label}</span>
    </div>`
      )
      .join('')}
  </div>`;
}

export function renderSplashScreen(
  container: HTMLElement,
  t: (key: string) => string,
  options?: SplashScreenOptions
): void {
  container.textContent = '';

  // SAFETY: all content is static SVG constants and internal i18n strings
  const html = `<div class="splash-container">
    <div class="splash-bg-shape">${SPLASH_BG_SHAPE_SVG}</div>
    ${renderSplashContent(t)}
    <div class="splash-visual">${SPLASH_ILLUSTRATION_SVG}</div>
    ${renderSplashChips(t)}
    <div class="splash-shelf"></div>
    <div class="splash-plant">${SPLASH_PLANT_SVG}</div>
  </div>`;

  const tmpl = document.createElement('template');
  tmpl.innerHTML = html;
  container.appendChild(tmpl.content);

  // Imperative DOM manipulation — must query specific SVG elements after insertion
  const wrapper = container.firstElementChild!;

  // Apply portal theme color to the background shape
  const shapePath = wrapper.querySelector('.splash-bg-shape path');
  if (shapePath) shapePath.setAttribute('fill', 'var(--ds-portal-splash-shape)');

  // Replace AudioBars with consumer's logo if provided
  const audioBars = wrapper.querySelector('#AudioBars');
  if (audioBars && options?.logoHtml) {
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    // Place on the laptop screen with skewX(-12) to match the laptop's 3D perspective
    const size = 70;
    const cx = 529.87 + 17; // center of original AudioBars
    const cy = 368.43 + 18.5;
    fo.setAttribute('x', String(cx - size / 2));
    fo.setAttribute('y', String(cy - size / 2));
    fo.setAttribute('width', String(size));
    fo.setAttribute('height', String(size));
    fo.setAttribute('transform', `translate(${cx}, ${cy}) skewX(-12) translate(-${cx}, -${cy})`);
    const logoBody = document.createElement('div');
    logoBody.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    logoBody.style.cssText =
      'display:flex;align-items:center;justify-content:center;width:100%;height:100%';
    // Extract only the icon/image from logoHtml (skip text labels) for the small laptop area
    const temp = document.createElement('div');
    temp.innerHTML = options.logoHtml;
    const img = temp.querySelector('img') || temp.querySelector('svg');
    if (img) {
      (img as HTMLElement).style.cssText = 'width:100%;height:100%;object-fit:contain';
      logoBody.appendChild(img);
    } else {
      // SAFETY: logoHtml is set by the SDK consumer (developer), not end-user input
      logoBody.innerHTML = options.logoHtml;
    }
    fo.appendChild(logoBody);
    audioBars.replaceWith(fo);
  } else if (audioBars) {
    // Recolor audio bars to match primary color
    const rects = audioBars.querySelectorAll('rect');
    rects.forEach((rect) => rect.setAttribute('fill', 'var(--ds-color-primary, #692CFF)'));
  }
}
