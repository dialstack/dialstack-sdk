/**
 * The `./pure` entry exists to be importable without registering the custom
 * elements — that is what makes it usable for SSR and tests, and it is why the
 * main entry is listed in the package's `sideEffects` and this one is not.
 *
 * The property is easy to break from a distance and fails silently when it does:
 * a bundler that inlines the dynamic `import()` calls in `registerComponents()`
 * hoists the component modules to module scope, where their
 * `customElements.define` calls run at load time. Nothing errors — the entry just
 * stops being pure, and SSR breaks for whoever relied on it.
 *
 * Asserted against the source here; the built bundles are covered by the
 * `sideEffects` field and the rollup config's chunk output.
 */

describe('pure entry', () => {
  const defined: string[] = [];
  const realDefine = customElements.define.bind(customElements);

  beforeEach(() => {
    defined.length = 0;
    jest.spyOn(customElements, 'define').mockImplementation((name, ctor, options) => {
      defined.push(name);
      // Still register: a later test importing the main entry would otherwise
      // see a half-registered document.
      if (!customElements.get(name)) realDefine(name, ctor, options);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('registers nothing when imported', async () => {
    await import('../pure');
    expect(defined).toEqual([]);
  });

  it('registers the components only once registerComponents() is called', async () => {
    const pure = await import('../pure');
    expect(defined).toEqual([]);

    await pure.registerComponents();

    expect(defined.length).toBeGreaterThan(0);
    expect(defined).toContain('dialstack-call-logs');
  });

  // Not `length > 0` and one sample tag: that is what let `call-history` go
  // unregistered here while the main entry registered it. A tag missing from
  // registerComponents() is invisible until a consumer on ./pure renders that
  // component and its React wrapper throws on an element that never upgraded.
  //
  // The expected set is the ComponentTagName union, transcribed once. Adding a
  // component means adding it here, which is the reminder to register it too.
  //
  // Asserted against the registry rather than against `define` calls: the registry
  // is realm-global, so a module already loaded by an earlier test does not call
  // `define` a second time and counting calls would report a false absence.
  // Awaiting alone has to be sufficient too — no trailing timeout — because a
  // caller creating a component on the next line gets an inert
  // HTMLUnknownElement if the promise settles early.
  it('registers every component tag, not merely some', async () => {
    const pure = await import('../pure');
    await pure.registerComponents();

    const expected = [
      'dialstack-ai-agent',
      'dialstack-call-history',
      'dialstack-call-logs',
      'dialstack-phone-number-ordering',
      'dialstack-phone-numbers',
      'dialstack-voicemails',
    ];
    const missing = expected.filter((tag) => !customElements.get(tag));
    expect(missing).toEqual([]);
  });
});
