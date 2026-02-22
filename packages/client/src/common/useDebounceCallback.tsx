import { useCallback, useEffect, useRef } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebounceCallback<T extends (...args: any[]) => void>(callback: T, delay = 2000) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const argsRef = useRef<Parameters<T> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const currentArgs = argsRef.current;
    if (currentArgs !== null) {
      argsRef.current = null;
      callbackRef.current(...currentArgs);
    }
  }, []);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      argsRef.current = args;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        flush();
      }, delay);
    },
    [delay, flush],
  );

  return { run: debouncedFn, flush };
}
