import { CallLogsComponent } from '../call-logs';
import type { CallLog } from '../../types';

/**
 * One conversation does not always fit in one call log. A parked caller picked
 * back up is a second entry, and they chain when a retriever is itself parked.
 * The component groups a page by conversation and orders each group the way the
 * conversation happened.
 *
 * The positions are places in a sequence, not depths in a tree: every entry of
 * a conversation is a peer covering its own stretch of it. A conversation of
 * one entry is 'none' and carries no grouping mark.
 */
describe('CallLogsComponent conversation grouping', () => {
  const t0 = Date.parse('2026-09-14T15:53:40Z');

  const call = (id: string, offsetSeconds: number, relatedCall: string | null = null): CallLog =>
    ({
      id,
      started_at: new Date(t0 + offsetSeconds * 1000).toISOString(),
      related_call: relatedCall,
    }) as unknown as CallLog;

  // The API returns newest first, which is the opposite of conversation order.
  const order = (calls: CallLog[]): Array<[string, string]> => {
    const component = new CallLogsComponent();
    const grouped = (
      component as unknown as {
        orderByConversation(c: CallLog[]): Array<{ call: CallLog; group: string }>;
      }
    ).orderByConversation(calls);
    return grouped.map(({ call: c, group }) => [c.id, group]);
  };

  it('leaves unrelated calls unmarked', () => {
    expect(order([call('c', 200), call('b', 100), call('a', 0)])).toEqual([
      ['c', 'none'],
      ['b', 'none'],
      ['a', 'none'],
    ]);
  });

  it('brackets a retrieval with the call it picked up', () => {
    // Newest first: the retrieval is listed before the caller it continues.
    expect(order([call('retrieval', 95, 'caller'), call('caller', 0, 'retrieval')])).toEqual([
      ['caller', 'start'],
      ['retrieval', 'end'],
    ]);
  });

  it('spans every retrieval of a caller parked more than once', () => {
    expect(
      order([
        call('third', 400, 'caller'),
        call('second', 200, 'caller'),
        call('first', 60, 'caller'),
        call('caller', 0, 'third'),
      ])
    ).toEqual([
      ['caller', 'start'],
      ['first', 'middle'],
      ['second', 'middle'],
      ['third', 'end'],
    ]);
  });

  // Alice calls Bob, Bob parks Alice, Carol retrieves her, Alice parks Carol,
  // Dave retrieves Carol. The links form a chain rather than a fan, and the
  // whole chain belongs under Alice's leg — including when Alice's own leg
  // ended long before the others.
  it('spans a whole chain from the leg it started on', () => {
    expect(
      order([call('dave', 400, 'carol'), call('carol', 100, 'alice'), call('alice', 0, 'carol')])
    ).toEqual([
      ['alice', 'start'],
      ['carol', 'middle'],
      ['dave', 'end'],
    ]);
  });

  it('ignores a link to a call that is not on this page', () => {
    expect(order([call('orphan', 95, 'on-another-page')])).toEqual([['orphan', 'none']]);
  });

  it('renders a group where its first-listed member fell', () => {
    expect(
      order([
        call('later', 500),
        call('retrieval', 95, 'caller'),
        call('caller', 0, 'retrieval'),
        call('earlier', 10),
      ])
    ).toEqual([
      ['later', 'none'],
      ['caller', 'start'],
      ['retrieval', 'end'],
      ['earlier', 'none'],
    ]);
  });
});
