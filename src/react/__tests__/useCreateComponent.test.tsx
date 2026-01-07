/**
 * Tests for useCreateComponent hook
 */

import React from 'react';
import { renderHook, waitFor, render, screen } from '@testing-library/react';
import { useCreateComponent } from '../useCreateComponent';
import { DialstackComponentsProvider } from '../DialstackComponentsProvider';
import type { DialStackInstance, ComponentElement } from '../../types';

// Mock the version constant
declare global {
  // eslint-disable-next-line no-var
  var _NPM_PACKAGE_VERSION_: string;
}
globalThis._NPM_PACKAGE_VERSION_ = '0.0.0-test';

// Create a proper mock element that behaves like a DOM element
const createMockElement = () => {
  const element = document.createElement('div') as unknown as ComponentElement['call-logs'];
  // Add the setInstance method that all components have
  (element as unknown as { setInstance: jest.Mock }).setInstance = jest.fn();
  return element;
};

// Mock DialStack instance
const createMockDialstack = (mockElement?: ComponentElement['call-logs']): DialStackInstance => {
  const element = mockElement ?? createMockElement();
  return {
    create: jest.fn().mockReturnValue(element),
    update: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  };
};

describe('useCreateComponent', () => {
  it('returns containerRef and componentInstance', () => {
    const mockDialstack = createMockDialstack();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DialstackComponentsProvider dialstack={mockDialstack}>{children}</DialstackComponentsProvider>
    );

    const { result } = renderHook(() => useCreateComponent(mockDialstack, 'call-logs'), { wrapper });

    expect(result.current.containerRef).toBeDefined();
    expect(typeof result.current.containerRef).toBe('function'); // callback ref
    expect(result.current.componentInstance).toBeNull(); // null before mount
  });

  it('calls dialstack.create with correct tagName', async () => {
    const mockDialstack = createMockDialstack();

    // Create a component that uses the hook
    const TestComponent = () => {
      const { containerRef, componentInstance } = useCreateComponent(mockDialstack, 'call-logs');
      return (
        <div>
          <div ref={containerRef} data-testid="container" />
          <span data-testid="instance">{componentInstance ? 'created' : 'pending'}</span>
        </div>
      );
    };

    render(
      <DialstackComponentsProvider dialstack={mockDialstack}>
        <TestComponent />
      </DialstackComponentsProvider>
    );

    await waitFor(() => {
      const instance = screen.getByTestId('instance');
      expect(instance.textContent).toBe('created');
    });

    expect(mockDialstack.create).toHaveBeenCalledWith('call-logs');
  });

  it('sets SDK version attribute on created component', async () => {
    const mockElement = createMockElement();
    const setAttributeSpy = jest.spyOn(mockElement, 'setAttribute');
    const mockDialstack = createMockDialstack(mockElement);

    const TestComponent = () => {
      const { containerRef } = useCreateComponent(mockDialstack, 'call-logs');
      return <div ref={containerRef} />;
    };

    render(
      <DialstackComponentsProvider dialstack={mockDialstack}>
        <TestComponent />
      </DialstackComponentsProvider>
    );

    await waitFor(() => {
      expect(setAttributeSpy).toHaveBeenCalledWith(
        'data-dialstack-sdk-version',
        expect.any(String)
      );
    });
  });

  it('appends component to container', async () => {
    const mockElement = createMockElement();
    const mockDialstack = createMockDialstack(mockElement);

    const TestComponent = () => {
      const { containerRef } = useCreateComponent(mockDialstack, 'voicemails');
      return <div ref={containerRef} data-testid="container" />;
    };

    render(
      <DialstackComponentsProvider dialstack={mockDialstack}>
        <TestComponent />
      </DialstackComponentsProvider>
    );

    await waitFor(() => {
      const container = screen.getByTestId('container');
      expect(container.childNodes.length).toBeGreaterThan(0);
    });
  });

  it('removes component on unmount', async () => {
    const mockElement = createMockElement();
    const mockDialstack = createMockDialstack(mockElement);

    const TestComponent = () => {
      const { containerRef } = useCreateComponent(mockDialstack, 'call-logs');
      return <div ref={containerRef} data-testid="container" />;
    };

    const { unmount } = render(
      <DialstackComponentsProvider dialstack={mockDialstack}>
        <TestComponent />
      </DialstackComponentsProvider>
    );

    // Wait for component to be created
    await waitFor(() => {
      const container = screen.getByTestId('container');
      expect(container.childNodes.length).toBeGreaterThan(0);
    });

    // Unmount and verify cleanup
    unmount();

    // The mock element should have been removed from its parent
    expect(mockElement.parentNode).toBeNull();
  });
});
