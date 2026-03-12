import '../../components/onboarding-portal';
import type { Meta, StoryObj } from '@storybook/react';
import { WebComponentStory } from './WebComponentStory';

const LOGO_HTML = `<div style="display:flex;align-items:center;gap:8px">
<svg width="28" height="24" viewBox="0 0 34 37" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="15.8" y="0" width="2.4" height="37" rx="1.2" fill="#692CFF"/>
<rect x="10.5" y="3.9" width="2.4" height="29.2" rx="1.2" fill="#692CFF"/>
<rect x="21.1" y="3.9" width="2.4" height="29.2" rx="1.2" fill="#692CFF"/>
<rect x="5.2" y="7.8" width="2.4" height="21.4" rx="1.2" fill="#692CFF"/>
<rect x="26.4" y="7.8" width="2.4" height="21.4" rx="1.2" fill="#692CFF"/>
<rect x="0" y="10.7" width="2.4" height="15.6" rx="1.2" fill="#692CFF"/>
<rect x="31.7" y="10.7" width="2.4" height="15.6" rx="1.2" fill="#692CFF"/>
</svg>
<span style="font-size:20px;font-weight:700;color:#f0f0ff">DialStack</span>
</div>`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setLogo = (el: any) => el.setLogoHtml(LOGO_HTML);

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/Onboarding/Portal',
  component: WebComponentStory,
  args: { tagName: 'onboarding-portal', setup: setLogo },
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };
