/**
 * The splash counts the steps ahead, so the count has to agree with the steps
 * the integrator kept via collectionOptions. It doesn't list them: the sidebar
 * beside it already does.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { defaultLocale, type AccountOnboardingStep } from '@dialstack/sdk-js';
import { SplashScreen } from '../SplashScreen';
import { renderWithOnboarding } from '../__test-helpers__/onboarding';

const splash = defaultLocale.onboardingPortal.splash;

function renderSplash(exclude?: AccountOnboardingStep[]) {
  return renderWithOnboarding(<SplashScreen onStart={() => {}} />, {
    collectionOptions: exclude ? { steps: { exclude } } : undefined,
  });
}

describe('SplashScreen', () => {
  it('counts every step by default', async () => {
    await renderSplash();
    expect(screen.getByText(splash.subtitle.replace('{count}', '4'))).toBeInTheDocument();
  });

  it('counts only the steps the integrator keeps', async () => {
    await renderSplash(['users', 'hardware']);
    expect(screen.getByText(splash.subtitle.replace('{count}', '2'))).toBeInTheDocument();
  });

  it('does not list the steps', async () => {
    await renderSplash();
    expect(screen.queryByText(splash.step1)).not.toBeInTheDocument();
    expect(screen.queryByText(splash.step2)).not.toBeInTheDocument();
    expect(screen.queryByText(splash.step3)).not.toBeInTheDocument();
  });

  it('drops the step count when one step remains', async () => {
    await renderSplash(['users', 'numbers', 'hardware']);
    expect(screen.getByText(splash.subtitleSingleStep ?? '')).toBeInTheDocument();
  });

  it('never promises zero steps', async () => {
    await renderWithOnboarding(<SplashScreen onStart={() => {}} />, {
      collectionOptions: { steps: { include: [] } },
    });
    expect(screen.getByText(splash.subtitleSingleStep ?? '')).toBeInTheDocument();
    expect(screen.queryByText(/0 easy steps/)).not.toBeInTheDocument();
  });
});
