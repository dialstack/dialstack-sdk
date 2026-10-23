import { defaultLocale } from '@dialstack/sdk-js';
import {
  resolveSoftphonePalette,
  type DirectoryContact,
  type Locale,
} from '@dialstack/sdk-react/core';

export const lightPalette = resolveSoftphonePalette({ theme: 'light' });
export const darkPalette = resolveSoftphonePalette({ theme: 'dark' });

export const t = (key: keyof Locale['softphone']): string => defaultLocale.softphone[key];

export const noop = (): void => {};

export const sampleDirectory: DirectoryContact[] = [
  { id: 'reception', label: 'Reception', destination: '100' },
  {
    id: 'dana-ortiz',
    label: 'Dana Ortiz',
    destination: '201',
    description: 'Ext. 201',
    group: 'Team',
    tags: ['On call'],
  },
  {
    id: 'lee-park',
    label: 'Lee Park',
    destination: '202',
    description: 'Ext. 202',
    group: 'Team',
    tags: ['Spanish', 'Billing'],
  },
  {
    id: 'after-hours-line',
    label: 'After-hours line',
    destination: '+14155550100',
    group: 'External',
  },
];
