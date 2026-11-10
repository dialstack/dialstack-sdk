import '../../components/to-call-back';
import type { Meta, StoryObj } from '@storybook/react';
import { withCallActivityData } from '../../__mocks__/call-activity-mock';
import type { DialStackInstanceImpl } from '../../types/core';
import { WebComponentStory } from './WebComponentStory';

const withData = (i: DialStackInstanceImpl) => withCallActivityData(i);
const withNoData = (i: DialStackInstanceImpl) => withCallActivityData(i, true);

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/Call Activity/To call back',
  component: WebComponentStory,
  args: {
    tagName: 'to-call-back',
    extendInstance: withData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup: (el: any) => {
      el.setPollInterval?.(null);
      el.setOnCallerSelect?.(() => {});
    },
  },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = { tags: ['vrt-cross-browser'] };
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Empty: Story = { args: { extendInstance: withNoData } };
