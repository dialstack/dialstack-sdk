/**
 * Tests for the SsaAcceptanceGate — the first-login subscription-agreement
 * acceptance screen.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SsaAcceptanceGate, SsaGateLoadError } from '../SsaAcceptanceGate';
import { DialstackComponentsProvider } from '../../DialstackComponentsProvider';
import {
  ApiError,
  defaultLocale,
  type DialStackInstance,
  type EffectivePricing,
  type Tos,
} from '@dialstack/sdk-js';
import { createMockInstance, mockTos, mockEffectivePricing } from '../__test-helpers__/onboarding';

const ssa = defaultLocale.accountOnboarding.ssa;

function renderGate(opts?: {
  tos?: Partial<Tos>;
  effectivePricing?: EffectivePricing | null;
  instanceOverrides?: Record<string, unknown>;
}) {
  const instance = createMockInstance(opts?.instanceOverrides);
  const tos: Tos = { ...(mockTos as Tos), ...opts?.tos };
  const pricing =
    opts?.effectivePricing === undefined ? mockEffectivePricing : opts.effectivePricing;
  const onAccepted = jest.fn();
  const result = render(
    <DialstackComponentsProvider dialstack={instance}>
      <SsaAcceptanceGate
        tos={tos}
        effectivePricing={pricing}
        locale={defaultLocale}
        onAccepted={onAccepted}
      />
    </DialstackComponentsProvider>
  );
  return { instance, onAccepted, ...result };
}

const acceptFn = (instance: DialStackInstance) => instance.account.tos.accept as jest.Mock;

describe('SsaAcceptanceGate', () => {
  it('renders the agreement text inline, pricing, and the affirmation language', () => {
    renderGate();
    expect(screen.getByText(ssa.title)).toBeInTheDocument();
    // The affirmation carries the e911 acceptance language from the API.
    expect(screen.getByText(mockTos.content)).toBeInTheDocument();
    expect(screen.getByText(ssa.pricingTitle)).toBeInTheDocument();
    // The billed rate, $15.00 per user. The agreement's own expanded pricing
    // says $99.00 in this fixture, so quoting the agreed schedule fails here.
    expect(screen.getByText(/\$15\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/\$99\.00/)).not.toBeInTheDocument();
    // The full agreement is rendered inline (not embedded from a URL).
    const region = screen.getByRole('region', { name: ssa.agreementLabel });
    expect(region.textContent).toContain('Emergency Calls (911)');
    // A secondary link still points to the canonical hosted copy.
    const link = screen.getByRole('link', { name: ssa.openInNewTab });
    expect(link.getAttribute('href')).toBe(mockTos.url);
  });

  // The price shown and the price recorded as evidence must be the same figure,
  // so a screen that can show no price must not be able to record consent.
  it('refuses to accept at all when the billed rates are unavailable', () => {
    renderGate({ effectivePricing: null });
    expect(screen.getByText(ssa.errors.pricingMissing)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ssa.accept })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  // A leg with no agreed rate is stored as 0 and billed at a catalog default that
  // is not the customer's price. Showing "$0.00" would state a price nobody
  // agreed to and imply the line is free.
  it('shows no figure for a rate that was never agreed, rather than $0.00', () => {
    renderGate({
      effectivePricing: { ...mockEffectivePricing, per_voiceai_location_rate: 0 },
    });
    expect(screen.getByText(/\$15\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
    // Still acceptable: an account not using VoiceAI has no VoiceAI rate.
    expect(screen.getByRole('button', { name: ssa.accept })).toBeInTheDocument();
  });

  it('disables Accept until the affirmation is checked', () => {
    renderGate();
    const button = screen.getByRole('button', { name: ssa.accept });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeEnabled();
  });

  it('records acceptance with the current version and calls onAccepted', async () => {
    const { instance, onAccepted } = renderGate();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: ssa.accept }));
    await waitFor(() => expect(acceptFn(instance)).toHaveBeenCalledWith(mockTos.version));
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
  });

  it('fails closed with a retry when the agreement body is missing', async () => {
    // Mixed-version deploy / stale response: the API did not return `body`. The
    // gate must not let the user accept an agreement whose body was never shown —
    // it routes to the load-error screen (with retry) instead.
    renderGate({ tos: { body: '' } });
    expect(screen.getByText(ssa.loadError.title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ssa.accept })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: ssa.agreementLabel })).not.toBeInTheDocument();

    // Retry re-fetches the agreement; the mock returns a body, so the gate
    // recovers into the normal accept flow rather than stranding the user.
    fireEvent.click(screen.getByRole('button', { name: ssa.loadError.retry }));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: ssa.agreementLabel })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: ssa.accept })).toBeInTheDocument();
  });

  it('shows a dead-end message and no Accept button when pricing is not set', () => {
    renderGate({
      tos: {
        pricing: { per_user_rate: null, per_did_rate: null, per_voiceai_location_rate: null },
      },
    });
    expect(screen.getByText(ssa.errors.pricingMissing)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ssa.accept })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('surfaces a stale-version (409) error without calling onAccepted', async () => {
    const { onAccepted } = renderGate({
      instanceOverrides: {
        account: {
          tos: {
            accept: jest.fn().mockRejectedValue(new ApiError('stale', 409, 'tos_version_stale')),
          },
        },
      },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: ssa.accept }));
    await waitFor(() => expect(screen.getByText(ssa.errors.stale)).toBeInTheDocument());
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('refreshes to the current version after a 409 and accepts the fresh one', async () => {
    const freshTos: Tos = {
      ...(mockTos as Tos),
      version: '1-final',
      content: 'Updated terms.',
    };
    const accept = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('stale', 409, 'tos_version_stale'))
      .mockResolvedValueOnce({ ...freshTos, acceptance: null });
    const { instance, onAccepted } = renderGate({
      instanceOverrides: {
        account: { tos: { accept, retrieve: jest.fn().mockResolvedValue(freshTos) } },
      },
    });

    // First attempt on the stale version → 409, gate refreshes the agreement.
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: ssa.accept }));
    await waitFor(() => expect(screen.getByText(ssa.errors.stale)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Updated terms.')).toBeInTheDocument());
    expect(onAccepted).not.toHaveBeenCalled();

    // Re-affirm and accept the refreshed version.
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: ssa.accept }));
    await waitFor(() => expect(acceptFn(instance)).toHaveBeenLastCalledWith('1-final'));
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
  });

  it('surfaces a pricing-not-set (422) error from the server', async () => {
    renderGate({
      instanceOverrides: {
        account: {
          tos: {
            accept: jest.fn().mockRejectedValue(new ApiError('no pricing', 422)),
          },
        },
      },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: ssa.accept }));
    await waitFor(() => expect(screen.getByText(ssa.errors.pricingMissing)).toBeInTheDocument());
  });
});

describe('SsaGateLoadError', () => {
  it('blocks with a retry that invokes onRetry', async () => {
    const onRetry = jest.fn().mockResolvedValue(undefined);
    render(
      <DialstackComponentsProvider dialstack={createMockInstance()}>
        <SsaGateLoadError locale={defaultLocale} onRetry={onRetry} />
      </DialstackComponentsProvider>
    );
    expect(screen.getByText(ssa.loadError.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: ssa.loadError.retry }));
    await waitFor(() => expect(onRetry).toHaveBeenCalled());
  });
});
