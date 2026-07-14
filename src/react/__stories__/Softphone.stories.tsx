import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Softphone } from '../softphone/Softphone';
import { SoftphoneProvider } from '../SoftphoneProvider';
import type { AppearanceOptions } from '../../types';

// <Softphone> is a pure consumer of <SoftphoneProvider> (which owns the
// connection + token). The provider opens a WebSocket for a live phone, so these
// stories render with autoConnect={false}: the dial screen is fully rendered (the
// Call button stays disabled until a real connection). The incoming / in-call
// screens require a live call and are covered by the interaction tests in
// ../__tests__/Softphone.test.tsx (which mock the phone).

// Story args drive the PROVIDER (the single token/appearance entry point); the
// <Softphone> itself takes no connection props.
interface StoryArgs {
  appearance?: AppearanceOptions;
}

const meta: Meta<StoryArgs> = {
  title: 'React/Softphone',
  render: ({ appearance }) => (
    <SoftphoneProvider token="preview-token" autoConnect={false} appearance={appearance}>
      <Softphone />
    </SoftphoneProvider>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

/** Idle dial pad, light theme. */
export const Dial: Story = {};

/** Idle dial pad, dark theme. */
export const DarkTheme: Story = {
  args: { appearance: { theme: 'dark' } },
};

/**
 * Idle dial pad, custom brand theme — a host overrides the appearance
 * `variables` (accent color, surface, radius, font) on top of the light theme,
 * the way a tenant would brand the embedded softphone.
 */
export const CustomTheme: Story = {
  args: {
    appearance: {
      theme: 'light',
      variables: {
        colorPrimary: '#7c3aed',
        colorPrimaryHover: '#6d28d9',
        colorBackground: '#faf5ff',
        colorText: '#2e1065',
        borderRadius: '14px',
        fontFamily: 'Georgia, "Times New Roman", serif',
      },
    },
  },
};
