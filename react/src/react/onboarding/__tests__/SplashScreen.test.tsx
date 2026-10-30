/**
 * The splash previews the steps ahead, so it has to agree with the steps the
 * integrator kept via collectionOptions.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { defaultLocale } from '@dialstack/sdk-js';
import { SplashScreen } from '../SplashScreen';
import { renderWithOnboarding } from '../__test-helpers__/onboarding';

const splash = defaultLocale.onboardingPortal.splash;

function renderSplash(exclude?: ('numbers' | 'hardware')[]) {
  return renderWithOnboarding(<SplashScreen onStart={() => {}} />, {
    collectionOptions: exclude ? { steps: { exclude } } : undefined,
  });
}

describe('SplashScreen', () => {
  it('lists every step by default', async () => {
    await renderSplash();
    expect(screen.getByText(splash.subtitle.replace('{count}', '3'))).toBeInTheDocument();
    expect(screen.getByText(splash.step1)).toBeInTheDocument();
    expect(screen.getByText(splash.step2)).toBeInTheDocument();
    expect(screen.getByText(splash.step3)).toBeInTheDocument();
  });

  it('lists only the steps the integrator keeps', async () => {
    await renderSplash(['hardware']);
    expect(screen.getByText(splash.subtitle.replace('{count}', '2'))).toBeInTheDocument();
    expect(screen.getByText(splash.step2)).toBeInTheDocument();
    expect(screen.queryByText(splash.step3)).not.toBeInTheDocument();
  });

  it('drops the step count when one step remains', async () => {
    await renderSplash(['numbers', 'hardware']);
    expect(screen.getByText(splash.subtitleSingleStep)).toBeInTheDocument();
    expect(screen.getByText(splash.step1)).toBeInTheDocument();
    expect(screen.queryByText(splash.step2)).not.toBeInTheDocument();
    expect(screen.queryByText(splash.step3)).not.toBeInTheDocument();
  });

  it('never promises zero steps', async () => {
    await renderWithOnboarding(<SplashScreen onStart={() => {}} />, {
      collectionOptions: { steps: { include: [] } },
    });
    expect(screen.getByText(splash.subtitleSingleStep ?? '')).toBeInTheDocument();
    expect(screen.queryByText(/0 easy steps/)).not.toBeInTheDocument();
  });
});
