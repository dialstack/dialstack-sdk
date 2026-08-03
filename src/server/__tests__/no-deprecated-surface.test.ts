import * as fs from 'fs';
import * as path from 'path';

/**
 * The server module must publish only the documented, canonical wire contract.
 *
 * The browser SDK's device and button types carry `*_id` aliases retained for
 * older clients — `location_id`, `base_id`, `template_id`, and friends. They are
 * marked `@deprecated` there and appear nowhere in the OpenAPI spec. Reusing
 * those types wholesale in the server module (which is how this nearly shipped)
 * would republish that legacy surface on a brand-new API and invite callers to
 * write fields the spec does not document.
 */
describe('server surface excludes deprecated and undocumented aliases', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

  /**
   * Deprecated `*_id` aliases that must never appear as a field. `user_id`,
   * `queue_id`, and `endpoint_id` are excluded from this list: those are real
   * documented field and query-parameter names, not aliases.
   */
  const FORBIDDEN_ALIASES = [
    'location_id',
    'base_id',
    'template_id',
    'primary_line_id',
    'override_id',
    'template_button_id',
    // Banned file-wide: `did_id` is the deprecated alias of `did` both as a
    // CallLog response field and as the call-log list filter. The handler still
    // accepts the query-parameter form for older callers, but it is undocumented
    // and the SDK must only speak the canonical name.
    'did_id',
  ];

  it.each(FORBIDDEN_ALIASES)('does not declare a %s field', (alias) => {
    // Matches an interface/type member declaration, not a mention in prose.
    const declaration = new RegExp(`^\\s+${alias}\\??:`, 'm');
    expect(source).not.toMatch(declaration);
  });

  it('filters call logs on the canonical did, not did_id', () => {
    // Resource-reference query filters are named after the resource, matching
    // GET /v1/faxes?did= and the CallLog response field.
    expect(interfaceBody('CallListParams')).toContain('did?: string');
  });

  /** The body of a top-level `export interface Foo { ... }` declaration. */
  function interfaceBody(name: string): string {
    const start = source.indexOf(`export interface ${name} {`);
    if (start === -1) throw new Error(`${name} is not declared in the server module`);
    const end = source.indexOf('\n}', start);
    return source.slice(start, end);
  }

  it('does not accept display_name on the device request params', () => {
    // The spec marks display_name `deprecated: true` on both device request
    // bodies as an alias of `name`. It stays valid on device *responses*.
    expect(interfaceBody('DeviceCreateParams')).not.toContain('display_name');
    expect(interfaceBody('DeviceUpdateParams')).not.toContain('display_name');
  });

  it('does not import the browser device and button models whose shapes diverge', () => {
    // Importing these is what pulled the deprecated aliases in. Compared as
    // exact specifiers: CreateTemplateButtonRequest is legitimately imported and
    // must not be mistaken for TemplateButton.
    const specifiers = new Set<string>();
    for (const block of source.matchAll(
      /import type \{([^}]*)\} from '\.\.\/types\/(?:device|button)';/gs
    )) {
      for (const name of block[1].split(',')) {
        const trimmed = name.trim();
        if (trimmed) specifiers.add(trimmed);
      }
    }
    expect(specifiers.size).toBeGreaterThan(0);

    for (const t of [
      'Device',
      'DeviceUserAssignment',
      'TemplateButton',
      'DeviceButtonOverride',
      'MaterializedButton',
      'ButtonCompatibilitySummary',
      'ButtonTemplateWithDetails',
      'CreateDeviceRequest',
      'UpdateDeviceRequest',
    ]) {
      expect(Array.from(specifiers)).not.toContain(t);
    }
  });
});
