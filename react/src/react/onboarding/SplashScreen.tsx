/**
 * Onboarding portal splash screen — shown to first-time users before onboarding starts.
 *
 * SAFETY NOTE: dangerouslySetInnerHTML is used only for:
 * - Static SVG string constants (SPLASH_BG_SHAPE_SVG, SPLASH_ILLUSTRATION_SVG, SPLASH_PLANT_SVG,
 *   ARROW_RIGHT_SVG) from our own splash-illustration.ts / constants.ts — never user input.
 * - logoHtml set by the SDK consumer (developer), not end-user input.
 * This mirrors the same pattern in the vanilla JS splash-screen.ts.
 */

import React, { useEffect, useRef } from 'react';
import { useOnboarding } from './OnboardingContext';
import {
  SPLASH_BG_SHAPE_SVG,
  SPLASH_ILLUSTRATION_SVG,
  SPLASH_PLANT_SVG,
} from './splash-illustration';
import { ARROW_RIGHT_SVG } from './portal-constants';

export interface SplashScreenProps {
  logoHtml?: string;
  platformName?: string;
  onStart: () => void;
}

function tp(str: string, platformName: string | undefined): string {
  return str.replace('{platformName}', platformName ?? 'DialStack');
}

const SplashScreenBase: React.FC<SplashScreenProps> = ({ logoHtml, platformName, onStart }) => {
  const { locale } = useOnboarding();
  const containerRef = useRef<HTMLDivElement>(null);

  // Imperative manipulation of the illustration SVG after mount —
  // same logic as the vanilla JS renderSplashScreen().
  useEffect(() => {
    if (!containerRef.current) return;

    // Apply portal theme color to background shape path
    const shapePath = containerRef.current.querySelector('.splash-bg-shape path');
    if (shapePath) shapePath.setAttribute('fill', 'var(--ds-portal-splash-shape)');

    // Replace AudioBars with consumer's logo if provided
    const audioBars = containerRef.current.querySelector('#AudioBars');
    if (audioBars && logoHtml) {
      const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      const size = 70;
      const cx = 529.87 + 17;
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
      const temp = document.createElement('div');
      // SAFETY: logoHtml is set by the SDK consumer (developer), not end-user input
      temp.innerHTML = logoHtml;
      const img = temp.querySelector('img') ?? temp.querySelector('svg');
      if (img) {
        (img as HTMLElement).style.cssText = 'width:100%;height:100%;object-fit:contain';
        logoBody.appendChild(img);
      } else {
        logoBody.innerHTML = logoHtml;
      }
      fo.appendChild(logoBody);
      audioBars.replaceWith(fo);
    } else if (audioBars) {
      // Recolor audio bars to match primary color
      const rects = audioBars.querySelectorAll('rect');
      rects.forEach((rect) => rect.setAttribute('fill', 'var(--ds-color-primary, #692CFF)'));
    }
  }, [logoHtml]);

  const chipLabels = [
    locale.onboardingPortal.splash.step1,
    locale.onboardingPortal.splash.step2,
    locale.onboardingPortal.splash.step3,
  ];

  return (
    <div className="splash-container" ref={containerRef}>
      {/* SAFETY: SPLASH_BG_SHAPE_SVG is a static constant from splash-illustration.ts */}
      {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
      <div className="splash-bg-shape" dangerouslySetInnerHTML={{ __html: SPLASH_BG_SHAPE_SVG }} />

      <div className="splash-content">
        <div className="splash-text">
          <h1 className="splash-title">{tp(locale.onboardingPortal.splash.title, platformName)}</h1>
          <p className="splash-subtitle">{locale.onboardingPortal.splash.subtitle}</p>
          <button className="splash-btn" onClick={onStart}>
            <span>{locale.onboardingPortal.splash.start}</span>
            {/* SAFETY: ARROW_RIGHT_SVG is a static constant from constants.ts */}
            {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
            <span dangerouslySetInnerHTML={{ __html: ARROW_RIGHT_SVG }} />
          </button>
        </div>
        <div className="splash-chips">
          {chipLabels.map((label, i) => (
            <div key={i} className="splash-chip">
              <div className="splash-chip-number">{i + 1}</div>
              <span className="splash-chip-label">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SAFETY: SPLASH_ILLUSTRATION_SVG is a static constant from splash-illustration.ts */}
      {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
      <div
        className="splash-visual"
        dangerouslySetInnerHTML={{ __html: SPLASH_ILLUSTRATION_SVG }}
      />

      <div className="splash-shelf" />

      {/* SAFETY: SPLASH_PLANT_SVG is a static constant from splash-illustration.ts */}
      {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
      <div className="splash-plant" dangerouslySetInnerHTML={{ __html: SPLASH_PLANT_SVG }} />
    </div>
  );
};
export const SplashScreen = React.memo(SplashScreenBase);
