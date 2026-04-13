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
  args: { dialPlanId: 'dp_01abc', mode: 'edit' },
};

export const CreateMode: Story = {
  args: { mode: 'edit' },
};

export const WithCallbacks: Story = {
  args: {
    dialPlanId: 'dp_01abc',
    mode: 'edit',
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
  args: { dialPlanId: 'dp_01abc', mode: 'edit' },
};

// ============================================================================
// Interaction tests (edit mode)
// ============================================================================

export const EditorRendersInCreateMode: Story = {
  args: { mode: 'edit' },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Node library panel is visible', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-node-library')).toBeInTheDocument();
      });
    });

    await step('Canvas area is present', async () => {
      expect(canvasElement.querySelector('.ds-dial-plan-editor__canvas')).toBeInTheDocument();
    });

    await step('Canvas starts blank (no default nodes)', async () => {
      const reactFlowNodes = canvasElement.querySelectorAll('.react-flow__node');
      // Only the Start node should be present
      expect(reactFlowNodes.length).toBeLessThanOrEqual(1);
    });

    await step('Toolbar is present', async () => {
      expect(canvas.getByText('Auto Layout')).toBeInTheDocument();
    });
  },
};

export const AddNodeFromLibrary: Story = {
  args: { mode: 'edit' },
  play: async ({ canvasElement, step }) => {
    await step('Wait for editor to render', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-node-library')).toBeInTheDocument();
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
        const allNodes = canvasElement.querySelectorAll('.react-flow__node');
        expect(allNodes.length).toBeGreaterThanOrEqual(2); // start + schedule
      });
    });
  },
};

export const SelectNodeOpensConfigPanel: Story = {
  args: { mode: 'edit' },
  play: async ({ canvasElement, step }) => {
    await step('Wait for editor to render', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-node-library')).toBeInTheDocument();
      });
    });

    await step('Add a Schedule node from the library', async () => {
      const library = canvasElement.querySelector('.ds-dial-plan-node-library')!;
      const libraryScope = within(library as HTMLElement);
      await userEvent.click(libraryScope.getByText('Schedule'));
    });

    await step('Config panel opens automatically for the new node', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-config-panel')).toBeInTheDocument();
      });
    });
  },
};

export const EscClosesConfigPanel: Story = {
  args: { mode: 'edit' },
  play: async ({ canvasElement, step }) => {
    await step('Wait for editor and add a node', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-node-library')).toBeInTheDocument();
      });
      const library = canvasElement.querySelector('.ds-dial-plan-node-library')!;
      const libraryScope = within(library as HTMLElement);
      await userEvent.click(libraryScope.getByText('Schedule'));
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
  args: { mode: 'edit' },
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
      await userEvent.click(libraryScope.getByText('Internal Extension'));
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
  args: { mode: 'edit' },
  play: async ({ canvasElement, step }) => {
    await step('Add a Schedule node from the library', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-node-library')).toBeInTheDocument();
      });
      const library = canvasElement.querySelector('.ds-dial-plan-node-library')!;
      const libraryScope = within(library as HTMLElement);
      await userEvent.click(libraryScope.getByText('Schedule'));
    });

    await step('Config panel opens', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-config-panel')).toBeInTheDocument();
      });
    });

    await step('Click Delete button in config panel', async () => {
      const configPanel = canvasElement.querySelector('.ds-dial-plan-config-panel')!;
      const panelScope = within(configPanel as HTMLElement);
      const deleteBtn = panelScope.getByTitle('Delete');
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
        const hasSchedule = Array.from(reactFlowNodes).some((n) =>
          n.textContent?.includes('Schedule')
        );
        expect(hasSchedule).toBe(false);
      });
    });
  },
};

export const ExternalDialPhoneNumberSave: Story = {
  args: { mode: 'edit' },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Add an External Number node from the library', async () => {
      await waitFor(() => {
        expect(canvasElement.querySelector('.ds-dial-plan-node-library')).toBeInTheDocument();
      });
      const library = canvasElement.querySelector('.ds-dial-plan-node-library')!;
      const libraryScope = within(library as HTMLElement);
      await userEvent.click(libraryScope.getByText('External Number'));
    });

    await step('Config panel opens with phone number input', async () => {
      await waitFor(() => {
        const panel = canvasElement.querySelector('.ds-dial-plan-config-panel');
        expect(panel).toBeInTheDocument();
        expect(within(panel as HTMLElement).getByRole('textbox')).toBeInTheDocument();
      });
    });

    await step('Type a valid E.164 phone number', async () => {
      const panel = canvasElement.querySelector('.ds-dial-plan-config-panel')!;
      const phoneInput = within(panel as HTMLElement).getByRole('textbox');
      await userEvent.clear(phoneInput);
      await userEvent.type(phoneInput, '+14155551234');
    });

    await step('Save button enables while input is still focused', async () => {
      await waitFor(() => {
        const saveBtn = canvas.getByText('Save');
        expect(saveBtn).not.toBeDisabled();
      });
    });

    await step('Phone number appears on the node', async () => {
      await waitFor(() => {
        const externalNode = canvasElement.querySelector('.ds-dial-plan-node--external-dial');
        expect(externalNode).toBeInTheDocument();
        expect(externalNode!.textContent).toContain('(415) 555-1234');
      });
    });
  },
};
