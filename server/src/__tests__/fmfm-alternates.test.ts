import { DialStack, type FMFM } from '../index.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ladder: FMFM = {
  steps: [{ targets: [{ type: 'user', id: 'user_abc' }], timeout: 20 }],
  fallback: 'voicemail',
  alternates: [
    {
      key: 'mobile',
      steps: [{ targets: [{ type: 'external', number: '+14165551234' }], timeout: 30 }],
      fallback: 'hangup',
      confirm_external: true,
    },
  ],
};

function ok(body: unknown, status = 200) {
  return {
    ok: true,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  };
}

describe('FMFM alternates', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  it('sets alternates inside the ladder', async () => {
    mockFetch.mockResolvedValueOnce(ok({ id: 'user_abc', config: { find_me_follow_me: ladder } }));

    const user = await dialstack.users.update(
      'user_abc',
      { config: { find_me_follow_me: ladder } },
      acct
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/users/user_abc'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ config: { find_me_follow_me: ladder } }),
      })
    );
    expect(user.config?.find_me_follow_me?.alternates?.[0]?.key).toBe('mobile');
    // The primary is unchanged by carrying alternates.
    expect(user.config?.find_me_follow_me?.steps[0]?.targets[0]?.id).toBe('user_abc');
  });

  it('selects an alternate on a call by key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    });

    await dialstack.calls.create(
      { user: 'user_abc', dial_string: '+15551234567', find_me_follow_me_key: 'mobile' },
      acct
    );

    const body = (mockFetch.mock.calls[0][1] as { body: string }).body;
    expect(JSON.parse(body).find_me_follow_me_key).toBe('mobile');
  });

  // The overwhelmingly common call names no alternate and must not start
  // sending one unprompted.
  it('omits find_me_follow_me_key when none is selected', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    });

    await dialstack.calls.create({ user: 'user_abc', dial_string: '+15551234567' }, acct);

    const body = (mockFetch.mock.calls[0][1] as { body: string }).body;
    expect(body).not.toContain('find_me_follow_me_key');
  });
});
