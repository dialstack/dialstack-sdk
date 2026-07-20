/**
 * Tests for the OnboardingPortal's subscription-agreement gating decision.
 *
 * The gate itself is covered by SsaAcceptanceGate.test.tsx; these tests cover
 * whether the portal shows the gate at all. The server derives `tos_status` on
 * the account resource (`not_required` for accounts that are never prompted),
 * and the portal must honor it — while staying fail-closed for accounts that
 * owe acceptance or whose status is unknown.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { OnboardingPortal } from '../OnboardingPortal';
import { DialstackComponentsProvider } from '../../DialstackComponentsProvider';
import { defaultLocale } from '../../../locales';
import {
  createMockInstance,
  mockAccount,
  mockTos,
  type MockInstanceOverrides,
} from '../__test-helpers__/onboarding';

const ssa = defaultLocale.accountOnboarding.ssa;

function renderPortal(overrides?: MockInstanceOverrides) {
  const instance = createMockInstance(overrides);
  const result = render(
    <DialstackComponentsProvider dialstack={instance}>
      <OnboardingPortal />
    </DialstackComponentsProvider>
  );
  return { instance, ...result };
}

// The default mock tos has `acceptance: null`, so whether the gate shows is
// decided entirely by the account's tos_status in each scenario.
function accountWith(tosStatus?: 'signed' | 'unsigned' | 'not_required') {
  return {
    account: {
      retrieve: jest.fn().mockResolvedValue({ ...mockAccount, tos_status: tosStatus }),
    },
  };
}

// The gate replaces the entire portal, so the sidebar shell is the "past the
// gate" signal and the gate title is the "blocked" signal.
const portalShell = () => document.querySelector('.portal-layout');

async function expectGate() {
  await waitFor(() => expect(screen.getByText(ssa.title)).toBeInTheDocument());
  expect(portalShell()).not.toBeInTheDocument();
}

async function expectPortal() {
  await waitFor(() => expect(portalShell()).toBeInTheDocument());
  expect(screen.queryByText(ssa.title)).not.toBeInTheDocument();
}

describe('OnboardingPortal SSA gating', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('blocks the portal for an account that owes acceptance', async () => {
    renderPortal(accountWith('unsigned'));
    await expectGate();
  });

  it('blocks the portal when the account does not carry tos_status (fail closed)', async () => {
    renderPortal(accountWith(undefined));
    await expectGate();
  });

  it('skips the gate when acceptance is not required (sandbox/demo accounts)', async () => {
    renderPortal(accountWith('not_required'));
    await expectPortal();
  });

  it('skips the gate for a signed account (current acceptance on the tos resource)', async () => {
    renderPortal({
      account: {
        retrieve: jest.fn().mockResolvedValue({ ...mockAccount, tos_status: 'signed' }),
        tos: {
          retrieve: jest.fn().mockResolvedValue({
            ...mockTos,
            acceptance: { accepted_at: '2026-01-01T00:00:00Z', pricing: mockTos.pricing },
          }),
        },
      },
    });
    await expectPortal();
  });

  it('does not block on a tos load failure when acceptance is not required', async () => {
    renderPortal({
      account: {
        retrieve: jest.fn().mockResolvedValue({ ...mockAccount, tos_status: 'not_required' }),
        tos: { retrieve: jest.fn().mockRejectedValue(new Error('network')) },
      },
    });
    await expectPortal();
    expect(screen.queryByText(ssa.loadError.title)).not.toBeInTheDocument();
  });

  it('fails closed behind a retry when the account itself cannot be loaded', async () => {
    // A failed account fetch leaves the whole bootstrap at defaults (account
    // null, tosLoadFailed false). Without the account we cannot tell whether
    // acceptance is required, so the portal must block behind the load-error
    // retry rather than render ungated.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      renderPortal({
        account: { retrieve: jest.fn().mockRejectedValue(new Error('network')) },
      });
      await waitFor(() => expect(screen.getByText(ssa.loadError.title)).toBeInTheDocument());
      expect(portalShell()).not.toBeInTheDocument();
    } finally {
      warn.mockRestore();
    }
  });

  it('still fails closed on a tos load failure when acceptance is owed', async () => {
    renderPortal({
      account: {
        retrieve: jest.fn().mockResolvedValue({ ...mockAccount, tos_status: 'unsigned' }),
        tos: { retrieve: jest.fn().mockRejectedValue(new Error('network')) },
      },
    });
    await waitFor(() => expect(screen.getByText(ssa.loadError.title)).toBeInTheDocument());
    expect(portalShell()).not.toBeInTheDocument();
  });
});
