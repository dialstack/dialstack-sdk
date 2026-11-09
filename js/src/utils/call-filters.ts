import type { RangeFilter, SentimentFilters } from '../types';

export const SENTIMENT_LABEL_KEYS = ['sentiment', 'local_sentiment', 'remote_sentiment'] as const;

export const SENTIMENT_RANGE_KEYS = [
  'sentiment_score',
  'sentiment_magnitude',
  'local_sentiment_score',
  'local_sentiment_magnitude',
  'remote_sentiment_score',
  'remote_sentiment_magnitude',
] as const;

const RANGE_OPS = ['gt', 'gte', 'lt', 'lte'] as const;

function hasBound(range: RangeFilter | undefined): range is RangeFilter {
  return !!range && RANGE_OPS.some((op) => typeof range[op] === 'number');
}

/**
 * Append the sentiment conditions as the API parses them: a label as
 * `remote_sentiment=negative`, a range as one `key[op]=value` pair per bound.
 */
export function appendSentimentFilters(query: URLSearchParams, filters?: SentimentFilters): void {
  if (!filters) return;
  for (const key of SENTIMENT_LABEL_KEYS) {
    const label = filters[key];
    if (label) query.set(key, label);
  }
  for (const key of SENTIMENT_RANGE_KEYS) {
    const range = filters[key];
    if (!range) continue;
    for (const op of RANGE_OPS) {
      const value = range[op];
      if (typeof value === 'number' && Number.isFinite(value)) {
        query.set(`${key}[${op}]`, String(value));
      }
    }
  }
}

/** Number of sentiment fields carrying a condition: a label, or a range with any bound. */
export function countSentimentConditions(filters?: SentimentFilters): number {
  if (!filters) return 0;
  let count = 0;
  for (const key of SENTIMENT_LABEL_KEYS) if (filters[key]) count++;
  for (const key of SENTIMENT_RANGE_KEYS) if (hasBound(filters[key])) count++;
  return count;
}

/** Only the sentiment fields that carry a condition; empty ranges are dropped. */
export function pickSentimentFilters(filters?: SentimentFilters): SentimentFilters {
  const out: SentimentFilters = {};
  if (!filters) return out;
  for (const key of SENTIMENT_LABEL_KEYS) {
    const label = filters[key];
    if (label) out[key] = label;
  }
  for (const key of SENTIMENT_RANGE_KEYS) {
    const range = filters[key];
    if (!hasBound(range)) continue;
    const kept: RangeFilter = {};
    for (const op of RANGE_OPS) {
      if (typeof range[op] === 'number') kept[op] = range[op];
    }
    out[key] = kept;
  }
  return out;
}

export function sameSentimentFilters(a?: SentimentFilters, b?: SentimentFilters): boolean {
  const pa = pickSentimentFilters(a);
  const pb = pickSentimentFilters(b);
  for (const key of SENTIMENT_LABEL_KEYS) if (pa[key] !== pb[key]) return false;
  for (const key of SENTIMENT_RANGE_KEYS) {
    const ra = pa[key];
    const rb = pb[key];
    if (!ra || !rb) {
      if (ra !== rb) return false;
      continue;
    }
    for (const op of RANGE_OPS) if (ra[op] !== rb[op]) return false;
  }
  return true;
}
