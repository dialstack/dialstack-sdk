import type { DialStackInstance, Extension, ExtensionListResponse } from '@dialstack/sdk-js';

/**
 * Every extension on the account. `extensions.list()` returns one page of at
 * most 100, highest numbers first, which drops exactly the low user range the
 * new-user suggestion searches.
 */
export function listAllExtensions(dialstack: DialStackInstance): Promise<Extension[]> {
  return dialstack.fetchAllPages<Extension>(async ({ limit }) => {
    const response = await dialstack.fetchApi(`/v1/extensions?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Failed to list extensions: ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as ExtensionListResponse;
  });
}
