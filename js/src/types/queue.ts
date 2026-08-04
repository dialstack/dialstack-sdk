/**
 * Queue types shared across SDK consumers.
 *
 * QueueStrategy lives here (vs. inlined in `sdk/src/server/index.ts`) so
 * SDK consumers and admin/embed callers reach for one canonical source
 * rather than redeclaring the union per call site.
 */
export type QueueStrategy =
  'ringall' | 'linear' | 'rrmemory' | 'leastrecent' | 'fewestcalls' | 'random' | 'wrandom';
