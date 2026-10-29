import '../../components/phone-number-ordering';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, waitFor } from 'storybook/test';
import { WebComponentStory } from './WebComponentStory';

const meta: Meta<typeof WebComponentStory> = {
  title: 'Web Components/PhoneNumberOrdering',
  component: WebComponentStory,
  args: { tagName: 'phone-number-ordering' },
};

export default meta;
type Story = StoryObj<typeof WebComponentStory>;

export const Default: Story = {};
export const DarkTheme: Story = { args: { theme: 'dark' } };
export const Compact: Story = { args: { layoutVariant: 'compact' } };

const shadow = (canvasElement: HTMLElement): ShadowRoot | null | undefined =>
  canvasElement.querySelector('dialstack-phone-number-ordering')?.shadowRoot;

/**
 * An account that may order toll-free numbers. The search panels are overlaid
 * so switching tabs never moves the form, which sizes every tab to the tallest
 * panel: the toll-free one must stay as short as the area code one.
 */
export const TollFree: Story = {
  args: { effectivePricing: { toll_free_minute_rate_decimal: '1.9' } },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const root = shadow(canvasElement);
      expect(root?.querySelector('[data-type="toll_free"]')).toBeTruthy();
    });
    const root = shadow(canvasElement)!;
    // The stack is as tall as its tallest panel: without the toll-free one it
    // must be no shorter. A select renders a couple of pixels taller than an input.
    const stack = root.querySelector<HTMLElement>('.search-fields-stack')!;
    const withTollFree = stack.offsetHeight;
    const tollFree = root.querySelector<HTMLElement>('[data-panel="toll_free"]')!;
    tollFree.style.display = 'none';
    const withoutTollFree = stack.offsetHeight;
    tollFree.style.display = '';
    expect(withTollFree).toBeLessThanOrEqual(withoutTollFree + 4);
  },
};

const clickAction = (root: ShadowRoot, action: string): void => {
  root.querySelector<HTMLElement>(`[data-action="${action}"]`)?.click();
};

/**
 * Walk search → results → confirm → route and assert the routing picker
 * renders, a target can be selected, and "set up later" toggles back.
 */
export const RouteStep: Story = {
  play: async ({ canvasElement, step }) => {
    await step('Search for numbers', async () => {
      await waitFor(() => {
        const root = shadow(canvasElement);
        const input = root?.querySelector<HTMLInputElement>('#search-area-code');
        expect(input).toBeTruthy();
        input!.value = '212';
        input!.dispatchEvent(new Event('input', { bubbles: true }));
        clickAction(root!, 'search');
      });
    });

    await step('Select all results and continue to confirm', async () => {
      await waitFor(() => {
        const root = shadow(canvasElement);
        const selectAll = root?.querySelector<HTMLElement>('[data-action="select-all"]');
        expect(selectAll).toBeTruthy();
        selectAll!.click();
      });
      await waitFor(() => {
        const root = shadow(canvasElement)!;
        clickAction(root, 'continue');
        expect(root.querySelector('[data-action="continue-to-route"]')).toBeTruthy();
      });
    });

    await step('Advance to the route step and see routing targets', async () => {
      clickAction(shadow(canvasElement)!, 'continue-to-route');
      await waitFor(() => {
        const root = shadow(canvasElement);
        const target = root?.querySelector<HTMLElement>('[data-action="select-route-target"]');
        expect(target).toBeTruthy();
      });
    });

    await step('Selecting a target marks it, and "later" clears it', async () => {
      const root = shadow(canvasElement)!;
      root.querySelector<HTMLElement>('[data-action="select-route-target"]')!.click();
      await waitFor(() => {
        const selected = shadow(canvasElement)?.querySelector(
          '[data-action="select-route-target"].selected'
        );
        expect(selected).toBeTruthy();
      });
      clickAction(shadow(canvasElement)!, 'route-skip');
      await waitFor(() => {
        const later = shadow(canvasElement)?.querySelector('[data-action="route-skip"].selected');
        expect(later).toBeTruthy();
      });
    });

    await step('Keyboard: Enter selects a target option', async () => {
      const root = shadow(canvasElement)!;
      const option = root.querySelector<HTMLElement>('[data-action="select-route-target"]')!;
      option.focus();
      option.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
      await waitFor(() => {
        expect(
          shadow(canvasElement)?.querySelector('[data-action="select-route-target"].selected')
        ).toBeTruthy();
      });
    });

    await step('Keyboard: Space selects the "later" row', async () => {
      const root = shadow(canvasElement)!;
      const later = root.querySelector<HTMLElement>('[data-action="route-skip"]')!;
      later.focus();
      later.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      );
      await waitFor(() => {
        expect(
          shadow(canvasElement)?.querySelector('[data-action="route-skip"].selected')
        ).toBeTruthy();
      });
    });
  },
};
