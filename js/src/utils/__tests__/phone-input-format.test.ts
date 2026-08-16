import { formatOnBlur, formatWhileTyping } from '../phone-input-format';

describe('formatWhileTyping — insertions', () => {
  it('formats digits as they are typed', () => {
    expect(formatWhileTyping('7702126011', '770212601')).toBe('(770) 212-6011');
  });

  it('formats a single number carrying a country code', () => {
    expect(formatWhileTyping('17702126011', '1770212601')).toBe('1 (770) 212-6011');
  });

  it('leaves text that is not a number alone while it is being edited', () => {
    expect(formatWhileTyping('7702126011x22', '7702126011x2')).toBe('7702126011x22');
    expect(formatWhileTyping('Phone Number', 'Phone Numbe')).toBe('Phone Number');
  });

  it('leaves a run holding more than one number as it was typed', () => {
    // Formatting would collapse it to a bare digit string, destroying both the
    // grouping the reader needs and the evidence the parser splits on.
    const run = '(770) 212-60911 (404) 555-1212';
    expect(formatWhileTyping(`${run}1`, run)).toBe(`${run}1`);
  });

  it('lets a space be typed into a long run to break it up', () => {
    expect(formatWhileTyping('7702126011 404555121', '7702126011404555121')).toBe(
      '7702126011 404555121'
    );
  });
});

describe('formatWhileTyping — deletions are literal', () => {
  // Every bug this input has had came from rewriting during a deletion. One
  // keypress must remove exactly one character and nothing else.
  it.each([
    ['deleting the x leaves the space alone', '678-555-0199 x', '678-555-0199 x123'],
    ['deleting the space leaves the digits alone', '678-555-0199', '678-555-0199 '],
    ['deleting a digit removes only that digit', '(678) 555-019', '(678) 555-0199'],
    ['deleting a bracket removes only the bracket', '(770', '(770)'],
  ])('%s', (_label, raw, previous) => {
    expect(formatWhileTyping(raw, previous)).toBe(raw);
  });

  it('never removes a digit the reader did not delete', () => {
    // The whole sequence for clearing an extension off a pasted row.
    let value = '678-555-0199 x123';
    for (const expected of [
      '678-555-0199 x12',
      '678-555-0199 x1',
      '678-555-0199 x',
      '678-555-0199 ',
    ]) {
      value = formatWhileTyping(value.slice(0, -1), value);
      expect(value).toBe(expected);
    }
  });
});

describe('formatOnBlur', () => {
  it('settles a part-formatted value once the reader moves on', () => {
    expect(formatOnBlur('678-555-0199 ')).toBe('(678) 555-0199');
    expect(formatOnBlur('7702126011')).toBe('(770) 212-6011');
  });

  it('leaves a value that is still being corrected alone', () => {
    expect(formatOnBlur('7702126011x22')).toBe('7702126011x22');
    expect(formatOnBlur('Phone Number')).toBe('Phone Number');
    expect(formatOnBlur('7702126011 404555121')).toBe('7702126011 404555121');
  });

  it('leaves an empty value empty', () => {
    expect(formatOnBlur('')).toBe('');
  });
});

describe('formatWhileTyping — a character the reader typed always survives', () => {
  it('keeps a lone + instead of erasing it', () => {
    // Returning '' left the state unchanged, so React did not re-render and the
    // field went on showing a `+` the value no longer had.
    expect(formatWhileTyping('+', '')).toBe('+');
  });

  it('keeps a lone opening bracket', () => {
    expect(formatWhileTyping('(', '')).toBe('(');
  });

  it('keeps the + on an international number as it is typed', () => {
    // Dropping it reports the row as unreadable instead of "only US numbers can
    // be ported", and destroys the evidence for the better message.
    expect(formatWhileTyping('+44 20', '+44 2')).toContain('+44');
  });
});

describe('formatOnBlur — settling must not destroy what typing preserved', () => {
  it('keeps the + on an international number', () => {
    // 11 digits, so it used to fall through to US formatting and lose the `+`,
    // downgrading the row from "only US numbers can be ported" to "invalid".
    expect(formatOnBlur('+33 6 12 34 56 78')).toContain('+33');
  });

  it('still formats a plain US number', () => {
    expect(formatOnBlur('7702126011')).toBe('(770) 212-6011');
  });

  it('leaves a value with no digits alone', () => {
    expect(formatOnBlur('+')).toBe('+');
  });
});
