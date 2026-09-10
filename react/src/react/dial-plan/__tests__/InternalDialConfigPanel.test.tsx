/**
 * An Internal Extension node's timeout is inert unless the node overrules the
 * target it dials, so the toggle that declares that is the whole feature as far
 * as the editor is concerned. The number alone cannot say it: the editor
 * pre-fills a timeout into every node it creates, so "non-empty" would mean
 * "always".
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InternalDialConfigPanel } from '../config-panels/InternalDialConfigPanel';

// The panel loads its target list on mount. Nothing here asserts on that list,
// but the resolution still lands mid-test and would warn about an unwrapped
// update, so every case flushes it first.
const panel = async (config: Record<string, unknown>, onConfigChange = jest.fn()) => {
  render(
    <InternalDialConfigPanel
      config={config}
      onConfigChange={onConfigChange}
      listResources={jest.fn().mockResolvedValue([])}
    />
  );
  await act(async () => {});
  return onConfigChange;
};

const timeoutInput = () => screen.getByRole('spinbutton');

describe('InternalDialConfigPanel timeout override', () => {
  // The toggle alone decides whether the number governs, so the number stays
  // editable either way. Greying it out read well but made timeout 0 — the
  // documented "skip this node without dialing" sentinel — unauthorable: the
  // only way in was to turn the override on, type 0, and leave a flag on that
  // becomes live the moment anyone raises the number later.
  it('leaves the timeout editable whichever way the toggle is set', async () => {
    await panel({ target_id: 'user_1', timeout: 25 });
    expect(timeoutInput()).not.toBeDisabled();
    expect(timeoutInput()).toHaveValue(25);
  });

  it('authors the skip sentinel without turning the override on', async () => {
    const onConfigChange = await panel({ target_id: 'user_1', timeout: 25 });

    fireEvent.change(timeoutInput(), { target: { value: '0' } });

    expect(onConfigChange).toHaveBeenCalledWith({ timeout: 0 });
    expect(onConfigChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ timeout_override: true })
    );
  });

  it('defaults to off, so an unmigrated node leaves its target alone', async () => {
    await panel({ target_id: 'user_1', timeout: 25 });

    expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();
  });

  it('writes the flag rather than inferring it from the number', async () => {
    const onConfigChange = await panel({ target_id: 'user_1', timeout: 25 });

    fireEvent.click(screen.getByRole('radio', { name: 'On' }));

    expect(onConfigChange).toHaveBeenCalledWith({ timeout_override: true });
  });

  // The API refuses override + 0 at both layers, and the failure arrives as a
  // 400 on the whole plan — indistinguishable, during the rollout window, from
  // the schema 400s this same node type returns for unrelated reasons. So the
  // pair has to be unauthorable here.
  it('carries a skipped node up to a real duration when the override goes on', async () => {
    const onConfigChange = await panel({ target_id: 'user_1', timeout: 0 });

    fireEvent.click(screen.getByRole('radio', { name: 'On' }));

    expect(onConfigChange).toHaveBeenCalledWith({ timeout_override: true, timeout: 1 });
  });

  it('refuses to take the timeout back to 0 while the override is on', async () => {
    const onConfigChange = await panel({
      target_id: 'user_1',
      timeout: 25,
      timeout_override: true,
    });

    fireEvent.change(timeoutInput(), { target: { value: '0' } });

    expect(onConfigChange).toHaveBeenCalledWith({ timeout: 1 });
  });

  it('keeps a typed value across a round trip through off', async () => {
    // The toggle and the number are independent fields, so switching off must
    // not rewrite the number. A nullable timeout could not express this, which
    // is why the flag is a separate boolean.
    const onConfigChange = await panel({
      target_id: 'user_1',
      timeout: 25,
      timeout_override: true,
    });

    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));

    expect(onConfigChange).toHaveBeenCalledWith({ timeout_override: false });
    expect(onConfigChange).not.toHaveBeenCalledWith(expect.objectContaining({ timeout: 0 }));
  });
});
