/**
 * Locale types and exports for DialStack SDK
 */
import { en } from './en';

/**
 * Locale type derived from the English locale structure
 */
export type Locale = typeof en;

/**
 * Default locale (English)
 */
export const defaultLocale: Locale = en;

/**
 * Re-export English locale
 */
export { en };
