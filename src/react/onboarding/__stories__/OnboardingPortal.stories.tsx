import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../../__storybook__/types';
import { OnboardingPortal } from '../OnboardingPortal';

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

type Props = React.ComponentProps<typeof OnboardingPortal> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/Onboarding/Portal',
  component: OnboardingPortal,
  args: { logoHtml: LOGO_HTML },
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<Props>;

export const Default: Story = {};

export const WithBackButton: Story = {
  args: {
    onBack: () => alert('Back clicked'),
    backLabel: '← Back to Dashboard',
  },
};

export const WhiteLabeled: Story = {
  args: {
    platformName: 'Acme Telecom',
    logoHtml: `<div style="display:flex;align-items:center;gap:8px">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="12" cy="12" r="10" fill="#00A67E"/>
<path d="M8 12l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
<span style="font-size:20px;font-weight:700;color:#f0f0ff">Acme Telecom</span>
</div>`,
    appearance: { variables: { colorPrimary: '#00A67E', colorPrimaryHover: '#008F6D' } },
  },
};

export const DarkTheme: Story = {
  args: { theme: 'dark' as const },
};

export const WithHardwareExcluded: Story = {
  args: { collectionOptions: { steps: { exclude: ['hardware'] } } },
};

export const WithTemporaryDID: Story = {
  args: {
    dids: [
      {
        id: 'did_temp01',
        phone_number: '+15559990001',
        status: 'active',
        outbound_enabled: true,
        routing_target: null,
        number_class: 'temporary',
        created_at: '2026-03-20T10:00:00Z',
        updated_at: '2026-03-20T10:00:00Z',
      },
    ],
  },
};
