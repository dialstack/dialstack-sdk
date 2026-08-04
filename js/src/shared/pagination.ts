// Auto-pagination helper shared by the server client and the WebRTC phone
// SDK. Every SDK list method should return a PaginatedList so callers can
// either `await` the first page envelope or iterate the full collection with
// `autoPagingEach()` / `autoPagingToArray()`.

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
