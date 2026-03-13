import {
  SPLASH_BG_SHAPE_SVG,
  SPLASH_ILLUSTRATION_SVG,
  SPLASH_PLANT_SVG,
} from './splash-illustration';
import { ARROW_RIGHT_SVG } from './constants';

export interface SplashScreenOptions {
  logoHtml?: string;
}

export function renderSplashScreen(
  container: HTMLElement,
  t: (key: string) => string,
  options?: SplashScreenOptions
): void {
  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'splash-container';

  // Background shape — static SVG constant from splash-illustration.ts
  const bgShape = document.createElement('div');
  bgShape.className = 'splash-bg-shape';
  // SAFETY: SPLASH_BG_SHAPE_SVG is a static constant defined in this package
  bgShape.innerHTML = SPLASH_BG_SHAPE_SVG;
  // Apply portal theme color to the shape
  const shapePath = bgShape.querySelector('path');
  if (shapePath) shapePath.setAttribute('fill', 'var(--ds-portal-splash-shape)');
  wrapper.appendChild(bgShape);

  // Left content
  const content = document.createElement('div');
  content.className = 'splash-content';

  const title = document.createElement('h1');
  title.className = 'splash-title';
  title.textContent = t('onboardingPortal.splash.title');
  content.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'splash-subtitle';
  subtitle.textContent = t('onboardingPortal.splash.subtitle');
  content.appendChild(subtitle);

  const btn = document.createElement('button');
  btn.className = 'splash-btn';
  btn.setAttribute('data-action', 'start-onboarding');
  const btnText = document.createElement('span');
  btnText.textContent = t('onboardingPortal.splash.start');
  btn.appendChild(btnText);
  // SAFETY: ARROW_RIGHT_SVG is a static constant defined in constants.ts
  const arrowSpan = document.createElement('span');
  arrowSpan.innerHTML = ARROW_RIGHT_SVG;
  btn.appendChild(arrowSpan);
  content.appendChild(btn);

  wrapper.appendChild(content);

  // Right side: illustration
  // SAFETY: SPLASH_ILLUSTRATION_SVG is a static constant from splash-illustration.ts
  const visual = document.createElement('div');
  visual.className = 'splash-visual';
  visual.innerHTML = SPLASH_ILLUSTRATION_SVG;

  // Replace AudioBars with consumer's logo if provided
  const audioBars = visual.querySelector('#AudioBars');
  if (audioBars && options?.logoHtml) {
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    // Place on the laptop screen with matching rotation (5.58deg matches laptop perspective)
    const size = 70;
    const cx = 529.87 + 17; // center of original AudioBars
    const cy = 368.43 + 18.5;
    fo.setAttribute('x', String(cx - size / 2));
    fo.setAttribute('y', String(cy - size / 2));
    fo.setAttribute('width', String(size));
    fo.setAttribute('height', String(size));
    fo.setAttribute('transform', `rotate(5.58, ${cx}, ${cy})`);
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

  wrapper.appendChild(visual);

  // Floating step chips (staggered layout matching Figma)
  const chips = document.createElement('div');
  chips.className = 'splash-chips';
  const chipLabels = [
    t('onboardingPortal.splash.step1'),
    t('onboardingPortal.splash.step2'),
    t('onboardingPortal.splash.step3'),
  ];
  for (let i = 0; i < chipLabels.length; i++) {
    const chip = document.createElement('div');
    chip.className = 'splash-chip';
    const num = document.createElement('div');
    num.className = 'splash-chip-number';
    num.textContent = String(i + 1);
    chip.appendChild(num);
    const label = document.createElement('span');
    label.className = 'splash-chip-label';
    label.textContent = chipLabels[i] ?? '';
    chip.appendChild(label);
    chips.appendChild(chip);
  }
  wrapper.appendChild(chips);

  // Bottom shelf
  const shelf = document.createElement('div');
  shelf.className = 'splash-shelf';
  wrapper.appendChild(shelf);

  // Plant decoration
  // SAFETY: SPLASH_PLANT_SVG is a static constant from splash-illustration.ts
  const plant = document.createElement('div');
  plant.className = 'splash-plant';
  plant.innerHTML = SPLASH_PLANT_SVG;
  wrapper.appendChild(plant);

  container.appendChild(wrapper);
}
