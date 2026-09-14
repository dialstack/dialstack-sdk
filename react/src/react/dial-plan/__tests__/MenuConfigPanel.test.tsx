/**
 * The panel's job for extension entry is narrow: reflect the stored flag, and
 * keep every digit mappable as an option regardless of it.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MenuConfigPanel } from '../config-panels/MenuConfigPanel';

const panel = async (config: Record<string, unknown>, onConfigChange = jest.fn()) => {
  render(
    <MenuConfigPanel
      config={config}
      onConfigChange={onConfigChange}
      listResources={jest.fn().mockResolvedValue([])}
    />
  );
  await act(async () => {});
  return onConfigChange;
};

const extensionEntryCheckbox = () => screen.getByRole('checkbox');

describe('MenuConfigPanel extension entry', () => {
  it('is off unless the stored config turns it on', async () => {
    await panel({ timeout: 5, options: [{ digit: '1' }] });
    expect(extensionEntryCheckbox()).not.toBeChecked();
  }); // Every digit is ordinary input to the runtime, so extension entry must not
  // narrow what an option can be mapped to.
  it('keeps # and * mappable while the setting is on', async () => {
    await panel({ timeout: 5, options: [{ digit: '1' }], extension_entry_enabled: true });

    const offered = Array.from(screen.getByRole('combobox').querySelectorAll('option')).map(
      (o) => o.value
    );

    expect(offered).toContain('#');
    expect(offered).toContain('*');
  });

  it('turns back off without touching the options', async () => {
    const onConfigChange = await panel({
      timeout: 5,
      options: [{ digit: '1' }],
      extension_entry_enabled: true,
    });

    fireEvent.click(extensionEntryCheckbox());

    expect(onConfigChange).toHaveBeenCalledWith({ extension_entry_enabled: false });
  });
});
