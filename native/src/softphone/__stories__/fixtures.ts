import { defaultLocale } from '@dialstack/sdk-js';
import {
  resolveSoftphonePalette,
  type DirectoryContact,
  type Locale,
} from '@dialstack/sdk-react/core';

export const lightPalette = resolveSoftphonePalette({ theme: 'light' });
export const darkPalette = resolveSoftphonePalette({ theme: 'dark' });

// A host's brand, through the same appearance variables a host passes the
// provider (as the onboarding stories do), on both themes.
const BRANDED_LIGHT = {
  theme: 'light',
  variables: {
    colorPrimary: '#D1442A',
    colorBackground: '#FFF6EA',
    colorSurfaceSubtle: '#FBE6CF',
    colorText: '#1B2A4A',
    colorTextSecondary: '#7A6352',
    colorBorder: '#EFCFAE',
    colorSuccess: '#2A9D8F',
    colorWarning: '#E39B2D',
    colorDanger: '#B23A48',
  },
} as const;

const BRANDED_DARK = {
  theme: 'dark',
  variables: {
    colorPrimary: '#E0457B',
    colorBackground: '#0B1F24',
    colorSurfaceSubtle: '#123138',
    colorText: '#E6F4F1',
    colorTextSecondary: '#8FB3AE',
    colorBorder: '#1F4A52',
    colorSuccess: '#4CD4A0',
    colorWarning: '#FFB454',
    colorDanger: '#FF6B6B',
  },
} as const;

export const brandedLightPalette = resolveSoftphonePalette(BRANDED_LIGHT);
export const brandedDarkPalette = resolveSoftphonePalette(BRANDED_DARK);

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

// Users in every presence state, and a department with none.
export const presenceDirectory: DirectoryContact[] = [
  { id: 'user_ana', label: 'Ana Diaz', destination: '1001', presence: 'available' },
  { id: 'user_bo', label: 'Bo Chen', destination: '1002', presence: 'on_call' },
  { id: 'user_cy', label: 'Cy Ford', destination: '1003', presence: 'dnd' },
  { id: 'user_di', label: 'Di Moreau', destination: '1004', presence: 'away' },
  { id: 'user_ed', label: 'Ed Park', destination: '1005', presence: 'offline' },
  { id: 'sales', label: 'Sales', destination: '300', group: 'Departments' },
];
