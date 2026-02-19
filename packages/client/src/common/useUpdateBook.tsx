import { api } from '@/services/api';
import { FIVE_MINUTES, type Book } from '@audiobook/shared';
import { useEffect, useRef } from 'react';
import { useDebounceCallback } from './useDebounceCallback';

export function useUpdateBook(
  id: string | undefined,
  updatedBook: Partial<Book>,
  canUpdate: boolean,
  setBook: React.Dispatch<React.SetStateAction<Book | undefined>>,
  focusLine: (index?: number) => void,
) {
  const shouldSync = useRef(false);
  const updatedBookRef = useRef(updatedBook);

  const handleBookUpdate = async () => {
    if (!id) return;

    try {
      await api.books.update(id, updatedBookRef.current);
      setBook((prev) => (prev ? { ...prev, ...updatedBookRef.current } : prev));
    } catch (error) {
      console.error('Failed to update book: ', updatedBookRef.current, error);
    }
  };

  const { run: debounceUpdate, flush: flushUpdate } = useDebounceCallback(handleBookUpdate, FIVE_MINUTES);

  useEffect(() => {
    updatedBookRef.current = updatedBook;
  }, [updatedBook]);

  useEffect(() => {
    if (canUpdate) {
      debounceUpdate();
    }
  }, [debounceUpdate, canUpdate]);

  useEffect(() => {
    const handlePageVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (shouldSync.current) return;

        shouldSync.current = true;
        flushUpdate();
      } else if (document.visibilityState === 'visible') {
        shouldSync.current = false;
        setTimeout(() => {
          focusLine?.();
        }, 100);
      }
    };

    document.addEventListener('visibilitychange', handlePageVisibility);
    window.addEventListener('pagehide', handlePageVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handlePageVisibility);
      window.removeEventListener('pagehide', handlePageVisibility);
    };
  }, [id]);

  useEffect(() => {
    return () => {
      flushUpdate();
    };
  }, [flushUpdate]);

  return { flushUpdate };
}
