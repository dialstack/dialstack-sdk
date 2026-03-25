import type { Meta, StoryObj } from '@storybook/react';
import type { DecoratorArgs } from '../../__storybook__/types';
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { DialPlan } from '../DialPlan';

type Props = React.ComponentProps<typeof DialPlan> & DecoratorArgs;

const meta: Meta<Props> = {
  title: 'React/DialPlan',
  component: DialPlan,
  args: {
    style: { width: '100%', height: '600px' },
  },
};

export default meta;
type Story = StoryObj<Props>;

// ============================================================================
// View mode stories
// ============================================================================

export const Default: Story = {
  args: { dialPlanId: 'dp_01abc' },
};

export const WithMinimap: Story = {
  args: { dialPlanId: 'dp_01abc', showMinimap: true },
};

export const DarkTheme: Story = {
  args: { dialPlanId: 'dp_01abc', theme: 'dark' },
};

export const RingAllUsers: Story = {
  args: { dialPlanId: 'dp_ringall' },
};

// ============================================================================
// Edit mode stories
// ============================================================================

export const Editable: Story = {
  args: { dialPlanId: 'dp_01abc', editable: true },
};

export const CreateMode: Story = {
  args: { editable: true },
};

export const WithCallbacks: Story = {
  args: {
    dialPlanId: 'dp_01abc',
    editable: true,
    onSave: (plan) => console.log('Saved:', plan),
    onDirtyChange: (dirty) => console.log('Dirty:', dirty),
    onError: (error) => console.error('Error:', error),
  },
};

/**
 * DAG validation: try dragging an edge from "No Answer" on the Dial node
 * back to the Schedule node — it should be blocked (cycle prevention).
 * Valid forward connections are allowed.
 */
export const DagValidation: Story = {
  args: { dialPlanId: 'dp_01abc', editable: true },
};

// ============================================================================
// Interaction tests (edit mode)
// ============================================================================

export const EditorRendersInCreateMode: Story = {
  args: { editable: true },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Node library panel is visible', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-node-library')).toBeInTheDocument();
      });
      expect(canvas.getByText('Node Library')).toBeInTheDocument();
    });

    await step('Canvas area is present', async () => {
      expect(canvasElement.querySelector('.ds-dial-plan-editor__canvas')).toBeInTheDocument();
    });

    await step('Default ring_all_users node is visible on canvas', async () => {
      await waitFor(() => {
        expect(canvas.getAllByText('Ring All').length).toBeGreaterThanOrEqual(1);
      });
    });

    await step('Toolbar is present', async () => {
      expect(canvas.getByText('Auto Layout')).toBeInTheDocument();
    });
  },
};

export const AddNodeFromLibrary: Story = {
  args: { editable: true },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Wait for editor to render', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-node-library')).toBeInTheDocument();
      });
    });

    await step('Count initial nodes', async () => {
      await waitFor(() => {
        expect(canvas.getAllByText('Ring All').length).toBeGreaterThanOrEqual(1);
      });
    });

    await step('Click Schedule item in node library', async () => {
      const library = canvasElement.querySelector('.ds-dial-plan-node-library')!;
      const libraryScope = within(library as HTMLElement);
      const scheduleItem = libraryScope.getByText('Schedule');
      await userEvent.click(scheduleItem);
    });

    await step('New Schedule node appears on canvas', async () => {
      await waitFor(() => {
        const allScheduleEls = canvasElement.querySelectorAll('.react-flow__node');
        expect(allScheduleEls.length).toBeGreaterThanOrEqual(2);
      });
    });
  },
};

export const SelectNodeOpensConfigPanel: Story = {
  args: { editable: true },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Wait for editor to render with default node', async () => {
      await waitFor(() => {
        expect(canvas.getAllByText('Ring All').length).toBeGreaterThanOrEqual(1);
      });
    });

    await step('Config panel is not visible initially', async () => {
      expect(canvasElement.querySelector('.ds-dial-plan-config-panel')).toBeNull();
    });

    await step('Click on the Ring All node in the canvas', async () => {
      let ringAllNode: Element | null = null;
      await waitFor(() => {
        const reactFlowNodes = canvasElement.querySelectorAll('.react-flow__node');
        for (const node of reactFlowNodes) {
          if (node.textContent?.includes('Ring All')) {
            ringAllNode = node;
            break;
          }
        }
        expect(ringAllNode).not.toBeNull();
      });
      await userEvent.click(ringAllNode!);
    });

    await step('Config panel appears with correct node type label', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-config-panel')).toBeInTheDocument();
      });
      const configPanel = canvasElement.querySelector('.ds-dial-plan-config-panel')!;
      const panelScope = within(configPanel as HTMLElement);
      expect(panelScope.getByText('Ring All')).toBeInTheDocument();
    });
  },
};

export const EscClosesConfigPanel: Story = {
  args: { editable: true },
  play: async ({ canvasElement, step }) => {
    await step('Click on a node to open config panel', async () => {
      let ringAllNode: Element | null = null;
      await waitFor(() => {
        const reactFlowNodes = canvasElement.querySelectorAll('.react-flow__node');
        for (const node of reactFlowNodes) {
          if (node.textContent?.includes('Ring All')) {
            ringAllNode = node;
            break;
          }
        }
        expect(ringAllNode).not.toBeNull();
      });
      await userEvent.click(ringAllNode!);
    });

    await step('Verify config panel is visible', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-config-panel')).toBeInTheDocument();
      });
    });

    await step('Press Escape to close config panel', async () => {
      await userEvent.keyboard('{Escape}');
    });

    await step('Config panel disappears', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-config-panel')).toBeNull();
      });
    });
  },
};

export const AutoLayoutButton: Story = {
  args: { editable: true },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Wait for editor to render', async () => {
      await waitFor(() => {
        expect(canvas.getByText('Auto Layout')).toBeInTheDocument();
      });
    });

    await step('Add a Schedule node from the library', async () => {
      const library = canvasElement.querySelector('.ds-dial-plan-node-library')!;
      const libraryScope = within(library as HTMLElement);
      await userEvent.click(libraryScope.getByText('Schedule'));
    });

    await step('Add a Dial node from the library', async () => {
      const library = canvasElement.querySelector('.ds-dial-plan-node-library')!;
      const libraryScope = within(library as HTMLElement);
      await userEvent.click(libraryScope.getByText('Dial'));
    });

    await step('Click the Auto Layout button without crash', async () => {
      const autoLayoutBtn = canvas.getByText('Auto Layout');
      await userEvent.click(autoLayoutBtn);
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-editor__canvas')).toBeInTheDocument();
      });
    });
  },
};

export const DeleteNodeFromConfigPanel: Story = {
  args: { editable: true },
  play: async ({ canvasElement, step }) => {
    await step('Click Ring All node to select it', async () => {
      let ringAllNode: Element | null = null;
      await waitFor(() => {
        const reactFlowNodes = canvasElement.querySelectorAll('.react-flow__node');
        for (const node of reactFlowNodes) {
          if (node.textContent?.includes('Ring All')) {
            ringAllNode = node;
            break;
          }
        }
        expect(ringAllNode).not.toBeNull();
      });
      await userEvent.click(ringAllNode!);
    });

    await step('Config panel opens', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-config-panel')).toBeInTheDocument();
      });
    });

    await step('Click Delete button in config panel', async () => {
      const configPanel = canvasElement.querySelector('.ds-dial-plan-config-panel')!;
      const panelScope = within(configPanel as HTMLElement);
      const deleteBtn = panelScope.getByText('Delete');
      await userEvent.click(deleteBtn);
    });

    await step('Config panel closes after deletion', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-config-panel')).toBeNull();
      });
    });

    await step('Deleted node is no longer in the canvas', async () => {
      await waitFor(() => {
        const reactFlowNodes = canvasElement.querySelectorAll('.react-flow__node');
        const hasRingAll = Array.from(reactFlowNodes).some((n) =>
          n.textContent?.includes('Ring All')
        );
        expect(hasRingAll).toBe(false);
      });
    });
  },
};
