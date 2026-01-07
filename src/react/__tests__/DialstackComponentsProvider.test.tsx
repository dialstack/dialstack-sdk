/**
 * Tests for DialstackComponentsProvider
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import {
  DialstackComponentsProvider,
  useDialstackComponents,
} from '../DialstackComponentsProvider';
import type { DialStackInstance } from '../../types';

// Mock DialStack instance
const createMockDialstack = (): DialStackInstance => ({
  create: jest.fn(),
  update: jest.fn(),
  logout: jest.fn().mockResolvedValue(undefined),
});

describe('DialstackComponentsProvider', () => {
  it('renders children correctly', () => {
    const mockDialstack = createMockDialstack();

    render(
      <DialstackComponentsProvider dialstack={mockDialstack}>
        <div data-testid="child">Child Content</div>
      </DialstackComponentsProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('provides dialstack instance via context', () => {
    const mockDialstack = createMockDialstack();

    const TestComponent = () => {
      const { dialstack } = useDialstackComponents();
      return <div data-testid="instance">{dialstack ? 'has instance' : 'no instance'}</div>;
    };

    render(
      <DialstackComponentsProvider dialstack={mockDialstack}>
        <TestComponent />
      </DialstackComponentsProvider>
    );

    expect(screen.getByText('has instance')).toBeInTheDocument();
  });
});

describe('useDialstackComponents', () => {
  it('throws error when used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useDialstackComponents());
    }).toThrow('Could not find DialStack context');

    consoleSpy.mockRestore();
  });

  it('error message includes setup instructions link', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderHook(() => useDialstackComponents());
    } catch (error) {
      expect((error as Error).message).toContain('DialstackComponentsProvider');
      expect((error as Error).message).toContain('docs.dialstack.ai');
    }

    consoleSpy.mockRestore();
  });

  it('returns dialstack instance when inside provider', () => {
    const mockDialstack = createMockDialstack();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DialstackComponentsProvider dialstack={mockDialstack}>
        {children}
      </DialstackComponentsProvider>
    );

    const { result } = renderHook(() => useDialstackComponents(), { wrapper });

    expect(result.current.dialstack).toBe(mockDialstack);
  });
});
