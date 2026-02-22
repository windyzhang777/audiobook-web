import type { ReadingMode } from '@/pages/BookReader';
import { api } from '@/services/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounceCallback } from './useDebounceCallback';

export function useSearchBook(
  id: string | undefined,
  currentLine: number,
  jumpToIndex: (lineIndex?: number) => Promise<void>,
  forceControl: (isUserControl?: boolean, readingMode?: ReadingMode) => void,
) {
  const [searchText, setSearchText] = useState<string>('');
  const [searchRes, setSearchRes] = useState<number[]>([]);
  const [currentMatch, setCurrentMatch] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleBookSearch = async () => {
    const cleanSearchText = searchText.trim();
    if (!id || !cleanSearchText) {
      setSearchRes([]);
      return;
    }

    try {
      const { indices } = await api.books.search(id, cleanSearchText);
      setSearchRes(indices);
      if (!indices || indices.length === 0) return;

      // Find match as "nearest prev with forward fallback"
      let nearestMatchIndex = indices.findLastIndex((idx) => idx <= currentLine);
      if (nearestMatchIndex === -1) nearestMatchIndex = indices.findIndex((idx) => idx >= currentLine);
      setCurrentMatch(nearestMatchIndex);
      jumpToIndex(indices[nearestMatchIndex]);
    } catch (error) {
      console.error(error);
    }
  };

  const prevMatch = () => {
    if (searchRes.length === 0) return;

    const prev = (currentMatch - 1 + searchRes.length) % searchRes.length;
    setCurrentMatch(prev);
    jumpToIndex(searchRes[prev]);
  };

  const nextMatch = () => {
    if (searchRes.length === 0) return;

    const next = (currentMatch + 1) % searchRes.length;
    setCurrentMatch(next);
    jumpToIndex(searchRes[next]);
  };

  const clearSearch = useCallback(() => {
    if (!searchText && searchRes.length === 0) return;

    setSearchText('');
    searchInputRef.current?.blur();
    setSearchRes([]);
  }, [searchText, searchRes.length]);

  const { run: debounceSearch } = useDebounceCallback(handleBookSearch, 800);

  useEffect(() => {
    debounceSearch();
  }, [searchText, debounceSearch]);

  // hijack the browser's default search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        forceControl(true, 'search');
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 100);
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        clearSearch();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [clearSearch, forceControl]);

  return { searchInputRef, searchText, setSearchText, searchRes, currentMatch, prevMatch, nextMatch, clearSearch };
}
