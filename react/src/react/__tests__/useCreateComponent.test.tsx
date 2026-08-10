/**
 * Tests for useCreateComponent hook
 */

import React from 'react';
import { renderHook, waitFor, render, screen } from '@testing-library/react';
import { useCreateComponent } from '../useCreateComponent';
import { DialstackComponentsProvider } from '../DialstackComponentsProvider';
import type { DialStackInstance, ComponentElement } from '@dialstack/sdk-js';

// Mock the version constant
declare global {
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
    // create() adds the element to the instance's component set, so the hook has to
    // withdraw it when the upgrade assertion fails. The mock omitted this, which is
    // why the leak went unnoticed.
    removeAppearanceTarget: jest.fn(),
  };
};

describe('useCreateComponent', () => {
  it('returns containerRef and componentInstance', () => {
    const mockDialstack = createMockDialstack();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DialstackComponentsProvider dialstack={mockDialstack}>
        {children}
      </DialstackComponentsProvider>
    );

    const { result } = renderHook(() => useCreateComponent(mockDialstack, 'call-logs'), {
      wrapper,
    });

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
  // The registration failure mode this hook exists to convert into an error.
  //
  // `document.createElement` succeeds for any tag name, so an unregistered element
  // appends, renders nothing, and reports nothing — every setter the wrapper calls
  // afterwards is a silent no-op. Registration is a side effect of importing
  // @dialstack/sdk-js, which this package only PEERS on, so it goes missing when a
  // consumer skips the peer or a bundler drops its side-effect imports.
  describe('when the custom element was never registered', () => {
    // An inert HTMLUnknownElement is what document.createElement returns for an
    // unknown tag: a real node with none of the element's own methods.
    const createUnupgradedElement = () =>
      document.createElement('dialstack-call-logs') as unknown as ComponentElement['call-logs'];

    it('throws instead of mounting a component that would render nothing', () => {
      const mockDialstack = createMockDialstack(createUnupgradedElement());

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DialstackComponentsProvider dialstack={mockDialstack}>
          {children}
        </DialstackComponentsProvider>
      );
      const { result } = renderHook(() => useCreateComponent(mockDialstack, 'call-logs'), {
        wrapper,
      });

      expect(() => result.current.containerRef(document.createElement('div'))).toThrow(
        /not a registered custom element/
      );
    });

    // create() registers the element for appearance updates and dialstack-logout
    // before returning it, so a throw that does not withdraw it leaves an inert
    // element attached to the instance for as long as the instance lives.
    it('withdraws the element it created before the error propagates', () => {
      const element = createUnupgradedElement();
      const mockDialstack = createMockDialstack(element);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DialstackComponentsProvider dialstack={mockDialstack}>
          {children}
        </DialstackComponentsProvider>
      );
      const { result } = renderHook(() => useCreateComponent(mockDialstack, 'call-logs'), {
        wrapper,
      });

      expect(() => result.current.containerRef(document.createElement('div'))).toThrow();
      expect(mockDialstack.removeAppearanceTarget).toHaveBeenCalledWith(element);
    });

    it('names the package the consumer has to install', () => {
      const mockDialstack = createMockDialstack(createUnupgradedElement());

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DialstackComponentsProvider dialstack={mockDialstack}>
          {children}
        </DialstackComponentsProvider>
      );
      const { result } = renderHook(() => useCreateComponent(mockDialstack, 'call-logs'), {
        wrapper,
      });

      expect(() => result.current.containerRef(document.createElement('div'))).toThrow(
        /@dialstack\/sdk-js/
      );
    });

    it('accepts an element that carries setInstance, which upgraded ones do', () => {
      const mockDialstack = createMockDialstack();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DialstackComponentsProvider dialstack={mockDialstack}>
          {children}
        </DialstackComponentsProvider>
      );
      const { result } = renderHook(() => useCreateComponent(mockDialstack, 'call-logs'), {
        wrapper,
      });

      expect(() => result.current.containerRef(document.createElement('div'))).not.toThrow();
    });
  });
});
