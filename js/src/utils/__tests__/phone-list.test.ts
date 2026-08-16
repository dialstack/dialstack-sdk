import { formatNationalUS, parsePhoneNumberList, parsePhoneNumberRows } from '../phone-list';

const e164s = (text: string) => parsePhoneNumberList(text).numbers.map((n) => n.e164);
const reasons = (text: string) => parsePhoneNumberList(text).problems.map((p) => p.reason);

describe('parsePhoneNumberList — single numbers in the formats people actually paste', () => {
  it.each([
    ['(770) 212-6011', 'parenthesised with a space — the format that fails on other carriers'],
    ['770-212-6011', 'hyphenated'],
    ['+1 770 212 6011', 'E.164 with spaces'],
    ['17702126011', 'bare with country code'],
    ['7702126011', 'bare'],
    ['770.212.6011', 'dot separated'],
    ['  (770) 212-6011  ', 'surrounded by whitespace'],
  ])('accepts %s (%s)', (input) => {
    expect(e164s(input)).toEqual(['+17702126011']);
  });
});

describe('parsePhoneNumberList — several numbers in one blob', () => {
  it('splits on newlines', () => {
    expect(e164s('(770) 212-6011\n(404) 555-1212')).toEqual(['+17702126011', '+14045551212']);
  });

  it('splits on commas, semicolons, tabs and pipes', () => {
    expect(e164s('7702126011, 4045551212')).toEqual(['+17702126011', '+14045551212']);
    expect(e164s('7702126011; 4045551212')).toEqual(['+17702126011', '+14045551212']);
    expect(e164s('7702126011\t4045551212')).toEqual(['+17702126011', '+14045551212']);
    expect(e164s('7702126011|4045551212')).toEqual(['+17702126011', '+14045551212']);
  });

  it('handles CRLF and bare CR line endings', () => {
    expect(e164s('7702126011\r\n4045551212')).toEqual(['+17702126011', '+14045551212']);
    expect(e164s('7702126011\r4045551212')).toEqual(['+17702126011', '+14045551212']);
  });

  it('tiles a space-separated run into whole numbers', () => {
    expect(e164s('770 212 6011 404 555 1212')).toEqual(['+17702126011', '+14045551212']);
  });

  it('tiles a mixed 10 and 11 digit run', () => {
    expect(e164s('770 212 6011 1 404 555 1212')).toEqual(['+17702126011', '+14045551212']);
  });

  it('keeps input order across lines and segments', () => {
    expect(e164s('4045551212\n7702126011, 6785550134')).toEqual([
      '+14045551212',
      '+17702126011',
      '+16785550134',
    ]);
  });
});

describe('parsePhoneNumberList — text that is not a number is reported, never dropped', () => {
  it.each(['Phone', 'Main', 'DID', 'asdf'])('reports %p rather than ignoring it', (junk) => {
    // A heading and a typo are the same shape, so neither can be exempted
    // without letting the other through unseen. One deliberate deletion is the
    // same price every other unresolved line already costs.
    const result = parsePhoneNumberList(`${junk}\n7702126011`);
    expect(result.numbers.map((n) => n.e164)).toEqual(['+17702126011']);
    expect(result.problems.map((p) => p.raw)).toEqual([junk]);
  });

  it('skips genuinely blank lines', () => {
    const result = parsePhoneNumberList('7702126011\n\n\n4045551212');
    expect(result.numbers).toHaveLength(2);
    expect(result.problems).toEqual([]);
  });

  it('skips whitespace-only lines', () => {
    const result = parsePhoneNumberList('7702126011\n   \n4045551212');
    expect(result.numbers).toHaveLength(2);
    expect(result.problems).toEqual([]);
  });

  it('reports a header row carried in by a paste', () => {
    const result = parsePhoneNumberList('Phone Number\n(770) 212-6011\n(404) 555-1212');
    expect(result.numbers.map((n) => n.e164)).toEqual(['+17702126011', '+14045551212']);
    expect(result.problems.map((p) => p.raw)).toEqual(['Phone Number']);
  });

  it('does not let a stray word through while the rest of the list is valid', () => {
    // The dangerous shape: everything else parses, so nothing would block.
    const result = parsePhoneNumberList('Phone Number\n(770) 212-6011\nasdf');
    expect(result.problems.map((p) => p.raw)).toEqual(['Phone Number', 'asdf']);
  });
});

describe('parsePhoneNumberList — never emit a partial parse', () => {
  it('refuses a truncated run rather than porting the half it understood', () => {
    const result = parsePhoneNumberList('7702126011404555121');
    expect(result.numbers).toEqual([]);
    expect(result.problems.map((p) => p.reason)).toEqual(['ambiguous']);
  });

  it('emits nothing for a segment whose run contains a toll-free number', () => {
    const result = parsePhoneNumberList('8005551212 7702126011');
    expect(result.numbers).toEqual([]);
    expect(result.problems.map((p) => p.reason)).toEqual(['toll_free']);
  });

  it('emits nothing for a segment whose run contains a non-US number', () => {
    const result = parsePhoneNumberList('14165551234 17702126011');
    expect(result.numbers).toEqual([]);
    expect(result.problems.map((p) => p.reason)).toEqual(['not_us']);
  });

  it('still accepts the good lines around a bad one', () => {
    const result = parsePhoneNumberList('7702126011\n7702126011404555121\n4045551212');
    expect(result.numbers.map((n) => n.e164)).toEqual(['+17702126011', '+14045551212']);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.line).toBe(2);
  });
});

describe('parsePhoneNumberList — rejections that mirror the server', () => {
  it('rejects an impossible area code', () => {
    expect(reasons('(000) 123-4567')).toEqual(['invalid']);
  });

  it.each(['123', '5551234', '770-212', '1'])(
    'calls the half-typed %p a bad number, not an ambiguous split',
    (input) => {
      expect(reasons(input)).toEqual(['invalid']);
    }
  );

  it('rejects a Canadian number as not US', () => {
    expect(reasons('+1 416 555 1234')).toEqual(['not_us']);
  });

  it('rejects a non-NANP number as not US', () => {
    expect(reasons('+44 20 7946 0958')).toEqual(['not_us']);
  });

  it.each(['800', '833', '844', '855', '866', '877', '888'])(
    'rejects the %s toll-free range',
    (npa) => {
      expect(reasons(`(${npa}) 555-1212`)).toEqual(['toll_free']);
    }
  );
});

describe('parsePhoneNumberList — extensions are never stripped silently', () => {
  it.each([
    '770-212-6011 x123',
    '770-212-6011 ext 4',
    '770-212-6011 ext. 99',
    '7702126011 extension 7',
  ])('reports %p rather than guessing', (input) => {
    const result = parsePhoneNumberList(input);
    expect(result.numbers).toEqual([]);
    expect(result.problems.map((p) => p.reason)).toEqual(['has_extension']);
  });

  it('reports an extension on an otherwise invalid number as the extension problem', () => {
    const [problem] = parsePhoneNumberList('000-000-0000 x123').problems;
    expect(problem?.reason).toBe('has_extension');
  });
});

describe('parsePhoneNumberList — duplicates', () => {
  it('keeps the first occurrence and reports the rest', () => {
    const result = parsePhoneNumberList('(770) 212-6011\n(404) 555-1212\n770-212-6011');
    expect(result.numbers.map((n) => n.e164)).toEqual(['+17702126011', '+14045551212']);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]).toMatchObject({ e164: '+17702126011', line: 3, firstSeenLine: 1 });
  });

  it('treats differently-formatted repeats as the same number', () => {
    const result = parsePhoneNumberList('7702126011\n+1 770 212 6011\n(770) 212-6011');
    expect(result.numbers).toHaveLength(1);
    expect(result.duplicates).toHaveLength(2);
  });

  it('reports a wholesale double paste as every line duplicated', () => {
    const list = '7702126011\n4045551212\n6785550134';
    const result = parsePhoneNumberList(`${list}\n${list}`);
    expect(result.numbers).toHaveLength(3);
    expect(result.duplicates).toHaveLength(3);
  });
});

describe('parsePhoneNumberList — line attribution', () => {
  it('reports 1-based line numbers', () => {
    const result = parsePhoneNumberList('7702126011\n\n(000) 123-4567');
    expect(result.numbers[0]?.line).toBe(1);
    expect(result.problems[0]?.line).toBe(3);
  });

  it('attributes every number on a multi-number line to that line', () => {
    const result = parsePhoneNumberList('junk\n7702126011, 4045551212');
    expect(result.numbers.map((n) => n.line)).toEqual([2, 2]);
  });

  it('preserves the raw text of a problem line for display', () => {
    const [problem] = parsePhoneNumberList('  770-212-6011 x123  ').problems;
    expect(problem?.raw).toBe('770-212-6011 x123');
  });
});

describe('parsePhoneNumberList — empty input', () => {
  it('returns nothing for an empty string', () => {
    expect(parsePhoneNumberList('')).toEqual({ numbers: [], problems: [], duplicates: [] });
  });

  it('returns nothing for whitespace only', () => {
    expect(parsePhoneNumberList('\n\n   \t\n')).toEqual({
      numbers: [],
      problems: [],
      duplicates: [],
    });
  });
});

describe('formatNationalUS', () => {
  it('renders E.164 in national form', () => {
    expect(formatNationalUS('+17702126011')).toBe('(770) 212-6011');
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatNationalUS('nonsense')).toBe('nonsense');
  });

  it('is a fixed point: canonical text re-parses to itself', () => {
    const original = '(770) 212-6011\n(404) 555-1212\n(678) 555-0134';
    const canonical = parsePhoneNumberList(original)
      .numbers.map((n) => formatNationalUS(n.e164))
      .join('\n');
    expect(canonical).toBe(original);

    const reparsed = parsePhoneNumberList(canonical)
      .numbers.map((n) => formatNationalUS(n.e164))
      .join('\n');
    expect(reparsed).toBe(canonical);
  });
});

describe('parsePhoneNumberList — extensions without a preceding space', () => {
  it.each([
    '7702126011x22',
    '7702126011ext22',
    '(770) 212-6011x22',
    '7702126011#22',
    '7702126011 #22',
    '770-212-6011 x123',
  ])('reports %p as carrying an extension', (input) => {
    const result = parsePhoneNumberList(input);
    expect(result.numbers).toEqual([]);
    expect(result.problems.map((p) => p.reason)).toEqual(['has_extension']);
  });
});

describe('parsePhoneNumberList — digits the reader can see are never stripped', () => {
  it('reads full-width digits inside a run', () => {
    // `\D` treats these as punctuation, so before NFKC folding the whole
    // number vanished out of the run with nothing reported against it.
    expect(e164s('７７０２１２６０１１ 4045551212 2135551234')).toEqual([
      '+17702126011',
      '+14045551212',
      '+12135551234',
    ]);
  });

  it('reads full-width digits on their own', () => {
    expect(e164s('７７０２１２６０１１')).toEqual(['+17702126011']);
  });

  it('refuses a digit it cannot fold rather than dropping it', () => {
    const result = parsePhoneNumberList('٧٧٠٢١٢٦٠١١ 4045551212');
    expect(result.numbers).toEqual([]);
    expect(result.problems.map((p) => p.reason)).toEqual(['invalid']);
  });
});

describe('parsePhoneNumberList — a typo must not become a different real number', () => {
  it.each([
    ['(770) 212-60911 (404) 555-1212', 'stray digit inside the first number'],
    ['(464) 502-65811 (678) 605-1499', 'same shape, different numbers'],
    ['770212601 14045551212', 'a short first number followed by a full one'],
    [
      '1 770 212 6011 1 404 55 1212 1 213 555 1234',
      'a chunk reaching across a space to eat the next country code',
    ],
    ['1 646 82 8980 1 646 691 4663', 'the same, minimally'],
  ])('refuses %p (%s)', (input) => {
    const result = parsePhoneNumberList(input);
    // The run still divides evenly, so "nothing left over" cannot catch this —
    // only the writer's own spacing can.
    expect(result.numbers).toEqual([]);
    expect(result.problems.map((p) => p.reason)).toEqual(['ambiguous']);
  });

  it('still accepts a correctly-typed country-coded run, which is the risky shape', () => {
    // The guard that rejects the cases above keys on a lone "1" group, so the
    // form it constrains most has to keep working.
    expect(e164s('1 770 212 6011 1 404 555 1212')).toEqual(['+17702126011', '+14045551212']);
  });

  it('still accepts a correctly-typed space-separated pair', () => {
    expect(e164s('770 212 6011 404 555 1212')).toEqual(['+17702126011', '+14045551212']);
  });

  it('still accepts a mixed 10 and 11 digit pair', () => {
    expect(e164s('770 212 6011 1 404 555 1212')).toEqual(['+17702126011', '+14045551212']);
  });

  it('refuses a run with no spacing at all to break on', () => {
    // Two valid numbers glued together carry no evidence of where one ends.
    expect(parsePhoneNumberList('77021260114045551212').problems.map((p) => p.reason)).toEqual([
      'ambiguous',
    ]);
  });
});

describe('parsePhoneNumberRows', () => {
  const values = (t: string) => parsePhoneNumberRows(t).map((r) => r.value);

  it('gives one row per number, canonicalised', () => {
    expect(values('7702126011\n404-555-1212')).toEqual(['(770) 212-6011', '(404) 555-1212']);
  });

  it('fans a multi-number line out into separate rows', () => {
    expect(values('+1 678 555 0134, 6785550135')).toEqual(['(678) 555-0134', '(678) 555-0135']);
  });

  it('keeps input order across lines and segments', () => {
    expect(values('4045551212\n7702126011, 6785550134')).toEqual([
      '(404) 555-1212',
      '(770) 212-6011',
      '(678) 555-0134',
    ]);
  });

  it('keeps a repeat as its own row rather than dropping it', () => {
    // Whether a repeat matters is a question about the whole list; discarding
    // it here would lose text the writer typed.
    expect(values('7702126011\n770.212.6011')).toEqual(['(770) 212-6011', '(770) 212-6011']);
  });

  it('keeps unreadable text verbatim and says why', () => {
    const rows = parsePhoneNumberRows('Phone Number\n7702126011\n770-212-6011 x123');
    expect(rows).toEqual([
      { value: 'Phone Number', reason: 'invalid' },
      { value: '(770) 212-6011' },
      { value: '770-212-6011 x123', reason: 'has_extension' },
    ]);
  });

  it('classifies toll-free and non-US rather than accepting them', () => {
    expect(parsePhoneNumberRows('(800) 555-1212\n+1 416 555 1234').map((r) => r.reason)).toEqual([
      'toll_free',
      'not_us',
    ]);
  });

  it('refuses a run it cannot split, keeping the text for correction', () => {
    expect(parsePhoneNumberRows('7702126011404555121')).toEqual([
      { value: '7702126011404555121', reason: 'ambiguous' },
    ]);
  });

  it('drops only genuinely blank lines', () => {
    expect(values('7702126011\n\n   \n4045551212')).toEqual(['(770) 212-6011', '(404) 555-1212']);
  });

  it('returns nothing for empty input', () => {
    expect(parsePhoneNumberRows('')).toEqual([]);
  });
});

describe('parsePhoneNumberList — a typo is a bad number, not an ambiguous run', () => {
  it.each(['77021260111', '770212601', '12345'])(
    'calls %p invalid rather than ambiguous',
    (input) => {
      // Too short to be two numbers, so there is nothing ambiguous about it.
      expect(reasons(input)).toEqual(['invalid']);
    }
  );

  it.each(['7702126011404555121', '7702126011123'])(
    'still calls %p ambiguous — long enough to be a truncated pair',
    (input) => {
      expect(reasons(input)).toEqual(['ambiguous']);
    }
  );
});
