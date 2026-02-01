import { useCallback, useEffect, useRef } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebounceCallback<T extends (...args: any[]) => void>(callback: T, delay = 2000) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const argsRef = useRef<Parameters<T> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current && argsRef.current) {
        clearTimeout(timeoutRef.current);
        callbackRef.current(...argsRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      argsRef.current = args;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        argsRef.current = null;
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );
}
