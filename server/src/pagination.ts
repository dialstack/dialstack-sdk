// Auto-pagination for this package's list methods: `await` the returned value for
// the first page envelope, or iterate the whole collection with
// `autoPagingEach()` / `autoPagingToArray()`.
//
// Deliberately duplicated rather than shared. This package publishes with no
// runtime dependencies and builds with plain tsc, which leaves imports as
// imports — so importing this from a sibling would either add a dependency edge
// or emit a path outside the tarball. Duplication is safe *here* because the
// file is pure: interfaces plus one factory, no module state, nothing compared
// by identity, so two copies cannot skew.
//
// It does not scale. If a second helper wants sharing, or anything
// identity-bearing does, publish a real shared core instead of copying again.

/** The minimal list-envelope shape auto-pagination needs. */
export interface Page<I> {
  data: I[];
  next_page_url: string | null;
}

/** Item type carried by a page envelope. */
export type PageItem<P> = P extends Page<infer I> ? I : never;

/**
 * A promise of the first page, augmented with auto-pagination iterators that
 * lazily fetch subsequent pages by following `next_page_url`.
 */
export interface PaginatedList<P extends Page<unknown>> extends Promise<P> {
  autoPagingEach(): AsyncIterableIterator<PageItem<P>>;
  autoPagingToArray(options?: { limit?: number }): Promise<PageItem<P>[]>;
}

/**
 * Wrap a first-page promise with auto-pagination. `fetchNextPage` receives the
 * `next_page_url` from the previous page (a path relative to the API base).
 */
export function createPaginatedList<P extends Page<unknown>>(
  firstPagePromise: Promise<P>,
  fetchNextPage: (url: string) => Promise<P>
): PaginatedList<P> {
  const paginatedList = firstPagePromise as PaginatedList<P>;

  paginatedList.autoPagingEach = async function* (): AsyncIterableIterator<PageItem<P>> {
    let response = await firstPagePromise;

    // P extends Page<unknown>, so data is unknown[] under the constraint;
    // PageItem<P> recovers the concrete item type for callers.
    yield* response.data as PageItem<P>[];

    while (response.next_page_url) {
      response = await fetchNextPage(response.next_page_url);
      yield* response.data as PageItem<P>[];
    }
  };

  paginatedList.autoPagingToArray = async function (options?: {
    limit?: number;
  }): Promise<PageItem<P>[]> {
    const limit = options?.limit ?? 10000;
    const results: PageItem<P>[] = [];

    for await (const item of this.autoPagingEach()) {
      results.push(item);
      if (results.length >= limit) {
        break;
      }
    }

    return results;
  };

  return paginatedList;
}
