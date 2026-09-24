import { defaultLocale } from '@dialstack/sdk-js';
import { resolveSoftphonePalette, type Locale } from '@dialstack/sdk-react/core';

export const lightPalette = resolveSoftphonePalette({ theme: 'light' });
export const darkPalette = resolveSoftphonePalette({ theme: 'dark' });

export const t = (key: keyof Locale['softphone']): string => defaultLocale.softphone[key];

export const noop = (): void => {};
