/**
 * The timeout is greyed only where it is inert, which is the override off
 * against a target that owns timing of its own. `timeoutInert` carries that
 * judgement in from enrichNode, because the target's timing is known only once
 * the resource resolves.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InternalDialConfigPanel } from '../config-panels/InternalDialConfigPanel';

// The panel loads its target list on mount. Nothing here asserts on that list,
// but the resolution still lands mid-test and would warn about an unwrapped
// update, so every case flushes it first.
const panel = async (
  config: Record<string, unknown>,
  onConfigChange = jest.fn(),
  nodeData: Record<string, unknown> = {}
) => {
  render(
    <InternalDialConfigPanel
      nodeId="n1"
      config={config}
      nodeData={nodeData}
      onConfigChange={onConfigChange}
      listResources={jest.fn().mockResolvedValue([])}
    />
  );
  await act(async () => {});
  return onConfigChange;
};

// A toggle click is ignored when the segment is already selected, so a case
// that clicks the toggle twice has to feed each change back as the editor does.
const statefulPanel = async (initial: Record<string, unknown>) => {
  const seen: Array<Record<string, unknown>> = [];
  const Harness = () => {
    const [config, setConfig] = React.useState(initial);
    return (
      <InternalDialConfigPanel
        nodeId="n1"
        config={config}
        nodeData={{}}
        onConfigChange={(updates) => {
          seen.push(updates);
          setConfig((prev) => ({ ...prev, ...updates }));
        }}
        listResources={jest.fn().mockResolvedValue([])}
      />
    );
  };
  render(<Harness />);
  await act(async () => {});
  return seen;
};

const timeoutInput = () => screen.getByRole('spinbutton');

describe('InternalDialConfigPanel timeout override', () => {
  it('disables the stored timeout once the node reports it inert', async () => {
    await panel({ target_id: 'qu_1', timeout: 25 }, jest.fn(), { timeoutInert: true });
    expect(timeoutInput()).toBeDisabled();
    expect(timeoutInput()).toHaveValue(25);
  });

  // dialNodeRingTimeout is unconditional on the user path, so the stored number
  // rings a ladder-less user's devices whichever way the toggle is set. Greying
  // it would lock a live value.
  it('leaves the timeout editable for a target that owns no timing', async () => {
    await panel({ target_id: 'user_1', timeout: 25 }, jest.fn(), { timeoutInert: false });
    expect(timeoutInput()).not.toBeDisabled();
  });

  it('enables the timeout while the override is on', async () => {
    await panel({ target_id: 'user_1', timeout: 25, timeout_override: true });
    expect(timeoutInput()).not.toBeDisabled();
  });

  it('authors the skip sentinel without turning the override on', async () => {
    const onConfigChange = await panel({ target_id: 'user_1', timeout: 25 });

    fireEvent.change(timeoutInput(), { target: { value: '0' } });

    expect(onConfigChange).toHaveBeenCalledWith({ timeout: 0 });
    expect(onConfigChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ timeout_override: true })
    );
  });

  it('treats a missing flag as off for an existing unmigrated node', async () => {
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

  // The promotion is the only edit a skipped node behind a timing-owning target
  // can take, so without the restore an admin who opens the toggle and closes it
  // again has silently turned "skip" into a one-second ring on every device.
  it('puts the skip back when the override goes off again', async () => {
    const seen = await statefulPanel({ target_id: 'qu_1', timeout: 0 });

    fireEvent.click(screen.getByRole('radio', { name: 'On' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));

    expect(seen).toEqual([
      { timeout_override: true, timeout: 1 },
      { timeout_override: false, timeout: 0 },
    ]);
  });

  it('keeps a deliberate edit over a promoted skip', async () => {
    const seen = await statefulPanel({ target_id: 'qu_1', timeout: 0 });

    fireEvent.click(screen.getByRole('radio', { name: 'On' }));
    fireEvent.change(timeoutInput(), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));

    expect(seen[seen.length - 1]).toEqual({ timeout_override: false });
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
