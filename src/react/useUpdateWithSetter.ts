/**
 * React hook for managing component state with setter function
 */

import { useState, useCallback } from 'react';

/**
 * Hook that returns state and a setter function
 * Similar to useState but with additional type safety
 */
export function useUpdateWithSetter<T>(
  initialValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initialValue);

  const setter = useCallback((newValue: T) => {
    setValue(newValue);
  }, []);

  return [value, setter];
}
