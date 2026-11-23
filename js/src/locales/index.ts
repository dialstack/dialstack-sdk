/**
 * Locale types and exports for DialStack SDK
 */
import { en } from './en';

type EnglishLocale = typeof en;

/**
 * Every UI string, shaped like the English locale. Written as a mapped type
 * rather than `typeof en` so the generated reference links to it by name
 * instead of inlining every string wherever a locale is accepted. It is still
 * a type alias, not an interface, so it stays assignable to index-signature
 * types such as `Record<string, unknown>`. Every key and its English text is
 * listed under {@link en}.
 */
export type Locale = { [K in keyof EnglishLocale]: EnglishLocale[K] };

/**
 * Default locale (English)
 */
export const defaultLocale: Locale = en;

/**
 * Re-export English locale
 */
export { en };
