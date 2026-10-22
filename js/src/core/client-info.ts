/**
 * Builds the `DialStack-Client` request header: which DialStack packages are
 * loaded, at which versions, and which of their components have been mounted
 * on this page. Chrome drops a `User-Agent` set from page scripts, and
 * overriding it would erase the browser's own, so the SDK uses its own header.
 *
 * Example: `sdk-js/3.7.0;c=call-logs,voicemails sdk-react/3.7.0 app/acme-portal/2.1.0`
 */

import type { ClientAppInfo } from '../types';

export const CLIENT_HEADER = 'DialStack-Client';

// Header values reject control characters and the token grammar uses
// space, `/`, `;` and `,` as separators, so anything caller-supplied is
// reduced to a safe alphabet.
function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 64);
}

export class ClientInfo {
  // Insertion-ordered, so the header lists packages in load order.
  private packages = new Map<string, { version: string; components: Set<string> }>();

  private readonly app: ClientAppInfo | undefined;

  constructor(app?: ClientAppInfo) {
    this.app = app;
  }

  /** The header for a single package reporting a single component. */
  static forComponent(
    pkg: string,
    version: string,
    component: string,
    app?: ClientAppInfo
  ): string {
    const info = new ClientInfo(app);
    info.registerPackage(pkg, version);
    info.registerComponent(pkg, component);
    return info.header();
  }

  registerPackage(name: string, version: string): void {
    const components = this.packages.get(name)?.components ?? new Set<string>();
    this.packages.set(name, { version, components });
  }

  /**
   * Record that a component was mounted. Never unregistered: the header
   * answers "which components does this integration use", not "which are on
   * screen right now".
   */
  registerComponent(packageName: string, component: string): void {
    this.packages.get(packageName)?.components.add(component);
  }

  header(): string {
    const tokens: string[] = [];
    for (const [name, { version, components }] of this.packages) {
      const list = [...components].sort().map(sanitize).join(',');
      tokens.push(`${name}/${sanitize(version)}${list ? `;c=${list}` : ''}`);
    }
    if (this.app?.name) {
      tokens.push(`app/${sanitize(this.app.name)}/${sanitize(this.app.version || '0.0.0')}`);
    }
    return tokens.join(' ');
  }
}
