import type { Preview } from '@storybook/react';

// No provider and no mock phone: the stories render the presentational views,
// which take a palette and their state as props.
const preview: Preview = {
  argTypes: {
    theme: { control: 'select', options: ['light', 'dark'] },
  },
  args: { theme: 'light' },
  parameters: { layout: 'fullscreen' },
};

export default preview;
