import '../../components/account-onboarding/step-numbers';
import type { Meta, StoryObj } from '@storybook/react';
import { WebComponentStory } from './WebComponentStory';

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/Onboarding/Numbers',
  component: WebComponentStory,
  args: { tagName: 'onboarding-numbers' },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Compact: Story = { args: { layoutVariant: 'compact' } };

/** Navigates through the entire port flow to the review step with all fields prefilled. */
export const PortReviewPrefilled: Story = {
  args: {
    setup: (el: HTMLElement) => {
      const root = el.shadowRoot;
      if (!root) return;

      const waitFor = (selector: string): Promise<HTMLElement> =>
        new Promise((resolve) => {
          const check = () => {
            const found = root.querySelector<HTMLElement>(selector);
            if (found) return resolve(found);
            requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        });

      const fillInput = (id: string, value: string) => {
        const input = root.querySelector<HTMLInputElement>(`#${id}`);
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };

      const fillSel = (id: string, value: string) => {
        const select = root.querySelector<HTMLSelectElement>(`#${id}`);
        if (select) {
          select.value = value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      const click = (action: string) =>
        root.querySelector<HTMLElement>(`[data-action="${action}"]`)?.click();

      const getFocDate = (): string => {
        const d = new Date();
        let biz = 0;
        while (biz < 7) {
          d.setDate(d.getDate() + 1);
          if (d.getDay() !== 0 && d.getDay() !== 6) biz++;
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };

      waitFor('[data-action="num-start-port"]')
        .then(() => {
          // Port numbers
          click('num-start-port');
          fillInput('num-port-phone-0', '(212) 555-1001');
          click('num-add-port-phone');
          fillInput('num-port-phone-1', '(310) 555-0201');

          // Eligibility check (async — mock resolves in ~300ms)
          click('num-check-eligibility');
          return waitFor('[data-action="num-to-subscriber"]');
        })
        .then(() => {
          // Subscriber
          click('num-to-subscriber');
          fillInput('num-port-btn', '(212) 555-1001');
          fillInput('num-port-business-name', 'Acme Corp');
          fillInput('num-port-approver-name', 'Jane Doe');
          fillInput('num-port-account-number', '9876543210');
          fillInput('num-port-pin', '1234');
          fillInput('num-port-house-number', '350');
          fillInput('num-port-street-name', 'Fifth Avenue');
          fillInput('num-port-line2', 'Suite 3200');
          fillInput('num-port-city', 'New York');
          fillSel('num-port-state', 'NY');
          fillInput('num-port-zip', '10118');

          // FOC date
          click('num-to-foc-date');
          fillInput('num-port-foc-date', getFocDate());
          fillSel('num-port-foc-time', '10:00');

          // Documents — upload mock bill
          click('num-to-documents');
          const fileInput = root.querySelector<HTMLInputElement>('#num-bill-copy-input');
          if (fileInput) {
            const dt = new DataTransfer();
            dt.items.add(new File(['mock'], 'phone-bill.pdf', { type: 'application/pdf' }));
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          }

          // Review — sign
          click('num-to-review');
          fillInput('num-port-signature', 'Jane Doe');
        })
        .catch(() => {});
    },
  },
};
