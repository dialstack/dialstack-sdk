/**
 * Tests for useCreateComponent hook
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { useCreateComponent } from '../useCreateComponent';
import { DialstackComponentsProvider } from '../DialstackComponentsProvider';
import type { DialStackInstance, ComponentElement } from '../../core/types';

// Mock component element
const createMockElement = () => {
  const element = document.createElement('div') as unknown as ComponentElement['call-logs'];
  element.setInstance = jest.fn();
  return element;
};

// Mock DialStack instance
const createMockDialstack = (): DialStackInstance => {
  const mockElement = createMockElement();
  return {
    create: jest.fn().mockReturnValue(mockElement),
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
    expect(result.current.containerRef.current).toBeNull(); // null before mount
  });

  it('calls dialstack.create with correct tagName', async () => {
    const mockDialstack = createMockDialstack();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DialstackComponentsProvider dialstack={mockDialstack}>{children}</DialstackComponentsProvider>
    );

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

    const { findByTestId } = await import('@testing-library/react').then(({ render }) =>
      render(
        <DialstackComponentsProvider dialstack={mockDialstack}>
          <TestComponent />
        </DialstackComponentsProvider>
      )
    );

    await waitFor(async () => {
      const instance = await findByTestId('instance');
      expect(instance.textContent).toBe('created');
    });

    expect(mockDialstack.create).toHaveBeenCalledWith('call-logs');
  });

  it('sets SDK version attribute on created component', async () => {
    const mockElement = createMockElement();
    (mockElement as HTMLElement).setAttribute = jest.fn();

    const mockDialstack: DialStackInstance = {
      create: jest.fn().mockReturnValue(mockElement),
      update: jest.fn(),
      logout: jest.fn().mockResolvedValue(undefined),
    };

    const TestComponent = () => {
      const { containerRef } = useCreateComponent(mockDialstack, 'call-logs');
      return <div ref={containerRef} />;
    };

    const { render } = await import('@testing-library/react');
    render(
      <DialstackComponentsProvider dialstack={mockDialstack}>
        <TestComponent />
      </DialstackComponentsProvider>
    );

    await waitFor(() => {
      expect((mockElement as HTMLElement).setAttribute).toHaveBeenCalledWith(
        'data-dialstack-sdk-version',
        expect.any(String)
      );
    });
  });

  it('appends component to container', async () => {
    const mockElement = createMockElement();
    const mockDialstack: DialStackInstance = {
      create: jest.fn().mockReturnValue(mockElement),
      update: jest.fn(),
      logout: jest.fn().mockResolvedValue(undefined),
    };

    const TestComponent = () => {
      const { containerRef } = useCreateComponent(mockDialstack, 'voicemails');
      return <div ref={containerRef} data-testid="container" />;
    };

    const { render, screen } = await import('@testing-library/react');
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
});
