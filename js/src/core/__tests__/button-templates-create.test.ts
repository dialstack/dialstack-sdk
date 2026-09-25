import { DialStackInstanceImplClass } from '../instance';

function recordingInstance(): {
  instance: DialStackInstanceImplClass;
  calls: Array<[string, RequestInit | undefined]>;
} {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const instance = new DialStackInstanceImplClass({
    publishableKey: 'pk_test_x',
    fetchClientSecret: async () => ({ client_secret: 's', expires_at: 0 }),
  });
  instance.fetchApi = async (path: string, init?: RequestInit) => {
    calls.push([path, init]);
    return {
      ok: true,
      status: 201,
      json: async () => ({ id: 'btpl_1', name: 'Parks', buttons: [] }),
    } as unknown as Response;
  };
  return { instance, calls };
}

describe('buttonTemplates.create', () => {
  it('sends the layout in the body and asks for the buttons back', async () => {
    const { instance, calls } = recordingInstance();

    await instance.buttonTemplates.create(
      {
        name: 'Parks',
        buttons: [
          { position: 1, label: 'Park 1', type: 'speed_dial', target: { destination: '*681' } },
        ],
      },
      { expand: ['buttons'] }
    );

    const [path, init] = calls[0];
    expect(path).toBe('/v1/button_templates?expand%5B%5D=buttons');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Parks',
      buttons: [
        { position: 1, label: 'Park 1', type: 'speed_dial', target: { destination: '*681' } },
      ],
    });
  });

  it('posts to the bare path without options', async () => {
    const { instance, calls } = recordingInstance();

    await instance.buttonTemplates.create({ name: 'Default' });

    expect(calls[0][0]).toBe('/v1/button_templates');
  });
});
