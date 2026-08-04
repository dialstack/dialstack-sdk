import '../../components/ai-agent';
import type { Meta, StoryObj } from '@storybook/react';
import { WebComponentStory } from './WebComponentStory';

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/AIAgent',
  component: WebComponentStory,
  args: {
    tagName: 'ai-agent',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup: (el: any) => el.setAgentId?.('aia_01abc'),
  },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };

export const Create: Story = {
  args: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup: (el: any) => {
      el.setMode?.('create');
      el.setSubmitMode?.('host');
      el.setInitialValues?.({
        name: '',
        extension_number: '700',
        persona_name: '',
        greeting_name: '',
        instructions: '',
        faq_responses: [{ question: 'What are your hours?', answer: 'Monday to Friday, 9 to 5.' }],
        scheduling: { webhook_url: '' },
      });
      el.setOnCreateRequested?.(async () => ({
        agentId: 'aia_created',
        voiceAppId: 'va_created',
        name: 'Created Agent',
      }));
    },
  },
};

export const EditFull: Story = {
  args: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup: (el: any) => {
      el.setSubmitMode?.('host');
      el.setAgentId?.('aia_01abc');
      el.setInitialValues?.({
        name: 'Front Desk Agent',
        extension_number: '700',
        persona_name: 'Tony',
        greeting_name: 'Jones Family Dental',
        instructions: 'Help callers book appointments and route urgent calls.',
        faq_responses: [{ question: 'Where are you located?', answer: '123 Main Street.' }],
        scheduling: { webhook_url: 'https://example.com/api/dialstack/webhooks' },
      });
      el.setSecret?.('whsec_example');
      el.setOnSaveRequested?.(async () => undefined);
    },
  },
};

export const SecretRotation: Story = {
  args: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup: (el: any) => {
      el.setSubmitMode?.('host');
      el.setAgentId?.('aia_01abc');
      el.setInitialValues?.({ name: 'Front Desk Agent', faq_responses: [] });
      el.setSecret?.('whsec_before_rotation');
      el.setOnRotateSecretRequested?.(() => {
        el.setSecret?.('whsec_after_rotation');
      });
    },
  },
};

// Spineline mounts with `name` hidden because there's exactly one managed
// agent per practice — operators only edit persona/greeting/instructions/FAQ.
export const NameHidden: Story = {
  args: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup: (el: any) => {
      el.setAgentId?.('aia_01abc');
      el.setHideFields?.(['name']);
    },
  },
};
