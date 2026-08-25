/**
 * Tests for the External Number dial-plan node config panel.
 *
 * The panel gates on libphonenumber's `isValid()`, matching the outbound dial
 * policy that decides whether a call connects. That part is unchanged. What was
 * wrong is that a rejected entry was written away as `''` with no message: the
 * empty string matched what was already stored, so the editor never went dirty,
 * Save stayed disabled, and nothing reached the server.
 *
 * A rejection is now visible, and it leaves the stored number alone — the field
 * can show a draft the graph has not accepted, but the graph never quietly
 * loses a destination.
 *
 * Test numbers here use realistic exchanges rather than `555`, which is
 * special-cased in libphonenumber and where the JS and Go implementations
 * disagree; a `555` number can pass here and still be refused by the server.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExternalDialConfigPanel } from '../ExternalDialConfigPanel';
import type { ConfigPanelProps } from '../../registry-types';

function renderPanel(overrides: Partial<ConfigPanelProps> = {}, label = 'Phone Number') {
  const onConfigChange = jest.fn();
  const props: ConfigPanelProps = {
    config: { phone_number: '', timeout: 60 },
    onConfigChange,
    listResources: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  const utils = render(<ExternalDialConfigPanel {...props} />);
  // getByLabelText, not a querySelector escape hatch: if the label ever stops
  // associating with the input, these tests should be what notices. Matched
  // exactly — the clear button's own label also contains "phone number".
  const input = utils.getByLabelText(label) as HTMLInputElement;
  return { ...utils, input, onConfigChange: props.onConfigChange as jest.Mock };
}

/** Re-query the input after a rerender. */
const phoneInput = (label = 'Phone Number') => screen.getByLabelText(label) as HTMLInputElement;

/** Type a number and commit it the way a user does — blur off the field. */
function enter(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('ExternalDialConfigPanel', () => {
  it('rejects a right-length number whose exchange code is impossible, and says so', () => {
    const { input, onConfigChange } = renderPanel();

    // NXX "123" — NANP forbids an exchange code starting with 1, so this is
    // ten digits nobody can answer. The bug was never that we rejected it; it
    // was that we rejected it in silence.
    enter(input, '8011231234');

    expect(onConfigChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a valid phone number/i);
  });

  it.each([
    ['0000000000', 'all zeros'],
    ['1111111111', 'all ones'],
    ['1234567890', 'sequential'],
  ])('rejects keypad-mash that is the right length: %s (%s)', (digits) => {
    const { input } = renderPanel();

    enter(input, digits);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it.each([
    ['8392001234', '839 — newer SC overlay'],
    ['9834001234', '983 — newer CO overlay'],
    ['6456331234', '645 — newer NY overlay'],
  ])('accepts recently-introduced area codes: %s (%s)', (digits) => {
    const { input, onConfigChange } = renderPanel();

    enter(input, digits);

    // Verified valid under both libphonenumber-js and the Go phonenumbers the
    // outbound dial policy uses, so what this panel accepts is what the server
    // will actually dial.
    expect(onConfigChange).toHaveBeenLastCalledWith({ phone_number: `+1${digits}` });
  });

  it('still commits an ordinary assignable number', () => {
    const { input, onConfigChange } = renderPanel();

    enter(input, '8013625400');

    expect(onConfigChange).toHaveBeenCalledWith({ phone_number: '+18013625400' });
  });

  it('shows a readable error for a number that is too short to dial', () => {
    const { input } = renderPanel();

    enter(input, '801123');

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent(/enter a valid phone number/i);
    // libphonenumber's own vocabulary must not reach the user.
    expect(error.textContent).not.toMatch(/TOO_SHORT|NOT_A_NUMBER|INVALID_/);
  });

  it('keeps the rejected text on screen instead of blanking the field', () => {
    const { input } = renderPanel();

    enter(input, '801123');

    expect(input.value).toBe('(801) 123');
  });

  it('leaves the saved number alone when the next entry is rejected', () => {
    const { input, onConfigChange } = renderPanel({
      config: { phone_number: '+18013625400', timeout: 60 },
    });

    enter(input, '801123');

    expect(onConfigChange).not.toHaveBeenCalledWith({ phone_number: '' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  // Deliberately no blur. Dismissing the drawer with Escape fires none, so any
  // wipe on this path happens with no message ever rendering — the exact shape
  // of the original bug, and the reason the `enter()` helper cannot be trusted
  // to cover it.
  it('does not wipe the saved number on a mid-edit keystroke', () => {
    const { input, onConfigChange } = renderPanel({
      config: { phone_number: '+18013625400', timeout: 60 },
    });

    // One backspace off a working number.
    fireEvent.change(input, { target: { value: '(801) 362-540' } });

    expect(onConfigChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('commits while the input still has focus, so Save is live without a blur', () => {
    const { input, onConfigChange } = renderPanel();

    // No blur — the editor's Save button is disabled until the graph goes
    // dirty, so a commit deferred to blur would swallow the first click.
    fireEvent.change(input, { target: { value: '8392001234' } });

    expect(onConfigChange).toHaveBeenCalledWith({ phone_number: '+18392001234' });
  });

  // The add path: a node dragged in is already dirty from the add alone, its
  // default phone_number is '', and the API accepts empty. Without this signal
  // Save would write the empty node and pop a success toast — the reported bug
  // with a message attached.
  it('reports an invalid draft so the editor can hold Save shut', () => {
    const onInvalidDraftChange = jest.fn();
    const { input } = renderPanel({ onInvalidDraftChange });

    enter(input, '8011231234');

    expect(onInvalidDraftChange).toHaveBeenLastCalledWith(true);
  });

  it('withdraws the invalid-draft signal once the entry is fixed', () => {
    const onInvalidDraftChange = jest.fn();
    const { input } = renderPanel({ onInvalidDraftChange });

    enter(input, '8011231234');
    enter(input, '8013625400');

    expect(onInvalidDraftChange).toHaveBeenLastCalledWith(false);
  });

  it('withdraws the invalid-draft signal when the panel goes away', () => {
    const onInvalidDraftChange = jest.fn();
    const { input, unmount } = renderPanel({ onInvalidDraftChange });

    enter(input, '8011231234');
    expect(onInvalidDraftChange).toHaveBeenLastCalledWith(true);

    // Abandoning the draft must not leave Save wedged shut.
    unmount();

    expect(onInvalidDraftChange).toHaveBeenLastCalledWith(false);
  });

  it('clears the error once the entry becomes valid', () => {
    const { input } = renderPanel();

    enter(input, '801123');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    enter(input, '8013625400');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports, rather than silently drops, an entry grown past a valid prefix', () => {
    const { input, onConfigChange } = renderPanel();

    // Ten digits is valid and commits.
    fireEvent.change(input, { target: { value: '8013625400' } });
    expect(onConfigChange).toHaveBeenLastCalledWith({ phone_number: '+18013625400' });

    // One more digit and it is not valid at all.
    fireEvent.change(input, { target: { value: '80136254001' } });
    fireEvent.blur(input);

    // The committed number stands and the mismatch is on screen. Clearing here
    // instead would take the destination with it on the Escape path.
    expect(onConfigChange).toHaveBeenLastCalledWith({ phone_number: '+18013625400' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  // The editor reuses one panel instance across selections — it passes no key —
  // so the reset has to come from the component reacting to the incoming
  // config. Rerendering with a different config, and no key, is what selecting
  // another node actually looks like from in here.
  // Two freshly-added nodes both hold '' (see the node's defaultConfig), and
  // two nodes may point at the same destination on purpose. Watching the value
  // alone would miss the switch in both cases.
  it('drops the draft when another node holding the same value is selected', () => {
    const { input, rerender } = renderPanel({ nodeId: 'node-a' });

    enter(input, '801123');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ExternalDialConfigPanel
        nodeId="node-b"
        config={{ phone_number: '', timeout: 60 }}
        onConfigChange={jest.fn()}
        listResources={jest.fn().mockResolvedValue([])}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(phoneInput().value).toBe('');
  });

  it('drops the draft and its message when another node is selected', () => {
    const { input, rerender } = renderPanel();

    enter(input, '801123');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ExternalDialConfigPanel
        config={{ phone_number: '+18013625400', timeout: 60 }}
        onConfigChange={jest.fn()}
        listResources={jest.fn().mockResolvedValue([])}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(phoneInput().value).toBe('(801) 362-5400');
  });

  it('treats an emptied field as clearing the number, not as an error', () => {
    const { input, onConfigChange } = renderPanel({
      config: { phone_number: '+18013625400', timeout: 60 },
    });

    enter(input, '');

    expect(onConfigChange).toHaveBeenCalledWith({ phone_number: '' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses the caller-supplied locale strings for the label and the error', () => {
    const { input } = renderPanel(
      {
        locale: {
          configLabels: {
            phoneNumber: 'Numéro de téléphone',
            phoneNumberInvalid: 'Entrez un numéro de téléphone valide.',
            clearPhoneNumber: 'Effacer le numéro',
          },
        } as ConfigPanelProps['locale'],
      },
      'Numéro de téléphone'
    );

    // Querying by the translated label also proves the association survives it.
    expect(input).toBeInTheDocument();

    enter(input, '801123');

    expect(screen.getByRole('alert')).toHaveTextContent('Entrez un numéro de téléphone valide.');
    expect(screen.getByLabelText('Effacer le numéro')).toBeInTheDocument();
  });
});
