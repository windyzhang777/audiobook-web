import { useSearchBook } from '@/common/useSearchBook';
import { useUpdateBook } from '@/common/useUpdateBook';
import { triggerSuccess } from '@/helper';
import { api } from '@/services/api';
import { speechService, type SpeechConfigs } from '@/services/SpeechService';
import { calculateProgress, PAGE_SIZE, type Book, type BookContent, type SpeechOptions, type TextOptions } from '@audiobook/shared';
import { AArrowDown, AArrowUp, ArrowLeft, AudioLines, LibraryBig, Loader, Loader2, MapPin, Pause, Play, Search, UsersRound, X } from 'lucide-react';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Virtuoso, type LocationOptions, type VirtuosoHandle } from 'react-virtuoso';

export type ReadingMode = 'idle' | 'focus' | 'search';

const SPEECH_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

type VoiceType = 'system' | 'cloud';
export interface VoiceOption {
  type: VoiceType;
  id: string;
  displayName: string;
  enabled: boolean;
}
const VOICE_FALLBACK: VoiceOption = { type: 'system', id: 'system-default', displayName: 'System (Browser)', enabled: true };

export const BookReader = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [book, setBook] = useState<Book>();
  const [lines, setLines] = useState<BookContent['lines']>([]);
  const [lang, setLang] = useState('eng');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [totalLines, setTotalLines] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [readingMode, setReadingMode] = useState<ReadingMode>('idle');
  const [error, setError] = useState<string>();
  const [showRateIndicator, setShowRateIndicator] = useState(false);
  const [currentLine, setCurrentLine] = useState<Book['currentLine']>(0);
  const [fontSize, setFontSize] = useState<NonNullable<TextOptions['fontSize']>>(18);
  const [speechRate, setSpeechRate] = useState<NonNullable<SpeechOptions['rate']>>(1.0);
  const [voice, setVoice] = useState<VoiceOption['id']>();
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICE_FALLBACK);
  const [lastCompleted, setLastCompleted] = useState<string>();
  const updatedBook = useMemo(
    () => ({
      currentLine,
      lastCompleted,
      settings: { ...(book?.settings || {}), fontSize, rate: speechRate, voice: selectedVoice.id },
    }),
    [book?.settings, currentLine, lastCompleted, fontSize, speechRate, selectedVoice.id],
  );
  const canUpdate = !loading && JSON.stringify(updatedBook) !== JSON.stringify({ currentLine: book?.currentLine, settings: book?.settings });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrollRef = useRef(true);
  const isUserFocusRef = useRef(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isSearchJumping = useRef(false);

  const speechConfigs = (rate: number = speechRate): SpeechConfigs => ({ bookId: id || '', lines, lang, rate, selectedVoice });

  const availableVoices = useMemo(() => {
    const nativeVoices = speechService.getNativeVoices(lang);
    const nativeOptions: VoiceOption[] = nativeVoices.map((voice) => ({ type: 'system', id: voice.name, displayName: voice.name, enabled: true }));
    const cloudOptions: VoiceOption[] = [{ type: 'cloud', id: 'google-neural2', displayName: 'Google AI (Neural2)', enabled: true }];
    return [...(nativeOptions.length > 0 ? nativeOptions : [VOICE_FALLBACK]), ...cloudOptions];
  }, [lang]);

  const navigateBack = (replace: boolean = false) => {
    flushUpdate();
    navigate('/', { replace });
  };

  const forceControl = (isUserControl: boolean = true, mode: ReadingMode = 'idle') => {
    isUserScrollRef.current = isUserControl;
    isUserFocusRef.current = isUserControl;
    if (readingMode === mode) return;

    if (isUserControl) {
      setReadingMode(mode || 'focus');
    } else {
      handleClearSearch(mode);
    }
  };

  const handleClearSearch = (readingMode: ReadingMode = 'idle') => {
    clearSearch();
    setReadingMode(readingMode);
  };

  const scrollToLine = (index: number = currentLine, behavior: LocationOptions['behavior'] = 'smooth') => {
    virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior });
  };

  const handlePlayPause = () => {
    if (!id) return;

    jumpToRead();

    if (isPlaying) {
      speechService.pause();
    } else {
      const startFrom = currentLine >= totalLines ? 0 : currentLine;
      // if at the end, reset to start from the first line
      if (startFrom === 0) setCurrentLine(0);

      speechService.start(startFrom, speechConfigs());
    }
  };

  const handleLineClick = (lineIndex: number) => {
    forceControl(false, 'focus');
    setCurrentLine(lineIndex);

    if (isPlaying) {
      speechService.resume(lineIndex, speechConfigs());
    }
  };

  const jumpToRead = () => {
    forceControl(false, 'focus');
    scrollToLine(currentLine, 'auto');
  };

  const jumpToIndex = async (lineIndex: number = currentLine) => {
    if (!id) return;

    isSearchJumping.current = true;
    if (lineIndex >= lines.length) {
      await loadMoreLines(id, 0, lineIndex);
    }
    scrollToLine(lineIndex, 'auto');
    setTimeout(() => {
      isSearchJumping.current = false;
    }, 500);
  };

  const loadBookContent = async (id: string, offset: number = 0, limit: number = PAGE_SIZE) => {
    const content = await api.books.getContent(id, offset, limit);
    if (!content) return;

    setLines((prev) => (offset === 0 ? content.lines : [...prev, ...content.lines]));
    setLang(content.lang);
    setTotalLines(content.pagination.total);
    setHasMore(content.pagination.hasMore);
  };

  const loadMoreLines = async (id: string, offset: number = 0, limit: number = PAGE_SIZE) => {
    if (!hasMore || !id) return;

    setLoadingMore(true);
    try {
      await loadBookContent(id, offset, limit);
    } finally {
      setLoadingMore(false);
    }
  };

  const { flushUpdate } = useUpdateBook(id, updatedBook, canUpdate, setBook);
  const { searchInputRef, searchText, setSearchText, searchRes, currentMatch, prevMatch, nextMatch, clearSearch } = useSearchBook(id, currentLine, jumpToIndex, forceControl);

  useEffect(() => {
    if (!id) return;

    const loadBook = async (id: string) => {
      try {
        const book = await api.books.getById(id);
        if (!book) return;

        setBook(book);
        setCurrentLine(book.currentLine || 0);
        setFontSize(book.settings?.fontSize || 18);
        setSpeechRate(book.settings?.rate || 1.0);
        setVoice(book.settings?.voice || VOICE_FALLBACK.id);
        setLastCompleted(book.lastCompleted || undefined);

        await loadBookContent(id, 0, (book.currentLine || 0) + PAGE_SIZE);
      } catch (error) {
        setError('Failed to load book');
        console.error('Failed to load book: ', error);
      } finally {
        setLoading(false);
      }
    };

    loadBook(id);

    return () => {
      speechService.stop();

      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [id]);

  useEffect(() => {
    speechService.onLineEnd = (lineIndex) => setCurrentLine(lineIndex);
    speechService.onIsPlayingChange = (playing) => setIsPlaying(playing);
    speechService.onBookCompleted = (date) => {
      if (!lastCompleted) triggerSuccess();
      setLastCompleted(date);
    };

    return () => {
      speechService.onLineEnd = null;
      speechService.onIsPlayingChange = null;
      speechService.onBookCompleted = null;
    };
  }, [lastCompleted]);

  useEffect(() => {
    if (isUserScrollRef.current || !isPlaying) return;
    isUserFocusRef.current = false;

    const handleAutoScroll = () => {
      virtuosoRef.current?.scrollToIndex({ index: currentLine, align: 'center', behavior: 'smooth' });
    };

    handleAutoScroll();
  }, [isPlaying, currentLine]);

  useEffect(() => {
    if (!voice || availableVoices.length <= 2) return;

    const found = availableVoices.find((v) => v.id === voice);

    if (found) {
      setSelectedVoice(found);
    }
  }, [availableVoices, voice]);

  // hijack the browser's default scroll
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        handlePlayPause();
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveToLine(Math.min(currentLine + 1, totalLines - 1));
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveToLine(Math.max(currentLine - 1, 0));
      }
    };

    const moveToLine = (lineIndex: number) => {
      if (lineIndex == currentLine) return;

      forceControl(false, 'focus');
      setCurrentLine(lineIndex);

      if (isPlaying) {
        speechService.resume(lineIndex, speechConfigs());
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [currentLine, totalLines, handlePlayPause]);

  if (loading) {
    return (
      <div aria-label="loading" className="min-h-full flex justify-center items-center gap-2">
        <Loader />
      </div>
    );
  }

  if (!book || error) {
    return (
      <div className="absolute top-0 left-0 h-full w-full bg-white opacity-50 flex flex-col justify-center items-center gap-2">
        {error}
        <button onClick={() => navigateBack(true)}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-full relative overflow-hidden">
      {/* Book Lines */}
      <Virtuoso
        id="book-lines"
        ref={virtuosoRef}
        className="min-h-[90vh] h-[50vh] max-h-3/4 w-full leading-loose"
        data={lines}
        initialTopMostItemIndex={{ index: 0, align: 'center' }}
        increaseViewportBy={200}
        endReached={() => {
          if (!id || !hasMore || loadingMore || isSearchJumping.current) return;
          loadMoreLines(id, lines.length);
        }}
        atBottomStateChange={(atBottom) => {
          if (!id || !atBottom || !hasMore || loadingMore) return;
          loadMoreLines(id, lines.length);
        }}
        rangeChanged={(range) => {
          const isVisible = currentLine >= range.startIndex && currentLine <= range.endIndex;
          setShowJumpButton(!isVisible);
        }}
        // Custom List Container (Replacing <ol>)
        components={{
          Header: () => (
            <header className="relative text-center my-6 mx-12">
              <button className="absolute top-2 left-0 p-0!" onClick={() => navigateBack()} title="Back to Books">
                <ArrowLeft size={16} />
                <LibraryBig size={16} />
              </button>
              <h3 className="font-semibold">{book.title}</h3>
            </header>
          ),
          List: forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ style, children, ...props }, ref) => (
            <div
              {...props}
              ref={ref}
              tabIndex={0}
              onWheel={() => forceControl(true, readingMode)}
              onTouchMove={() => forceControl(true, readingMode)}
              className="outline-none list-none text-left px-12"
              style={{ ...style, fontSize }}
            >
              {children}
            </div>
          )),
          Footer: () => (
            <div className="h-20 w-full flex justify-center items-center text-sm text-gray-300">
              {loadingMore ? (
                <span className="flex justify-center items-center">
                  <Loader2 className="animate-spin mr-2" size={16} />
                  &nbsp;Loading more lines...
                </span>
              ) : !hasMore ? (
                <span>You've reach the end</span>
              ) : null}
            </div>
          ),
        }}
        // Individual Line Item
        itemContent={(index, line) => {
          const isCurrentMatch = searchRes[currentMatch] === index;

          const getHighlightedText = (text: string, highlight: string) => {
            if (!highlight.trim()) return text;
            const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
            return (
              <span>
                {parts.map((part, i) =>
                  part.toLowerCase() === highlight.toLowerCase() ? (
                    <mark key={i} className={`rounded-md py-1 outline-none bg-amber-200 ${isCurrentMatch ? 'bg-amber-500 ' : 'outline-none'}`}>
                      {part}
                    </mark>
                  ) : (
                    part
                  ),
                )}
              </span>
            );
          };

          return (
            <li
              key={`line-${index}`}
              role="button"
              tabIndex={index === currentLine ? 0 : -1}
              aria-current={index === currentLine ? 'location' : undefined}
              onDoubleClick={() => handleLineClick(index)}
              className={`cursor-pointer px-2 transition-colors duration-200 ease-in-out rounded-lg ${index === currentLine ? 'bg-amber-100 font-medium' : ''} focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-opacity-50`}
            >
              {searchText ? getHighlightedText(line, searchText) : line}
            </li>
          );
        }}
      />

      {/* Scrollbar Marker */}
      <div
        id="scrollbar-marker"
        className="absolute top-3 right-0.5 w-3 pointer-events-none z-10"
        style={{
          minHeight: 'calc(90vh - 1.5rem)',
          height: 'calc(50vh - 1.5rem)',
          maxHeight: 'calc(75% - 1.5rem)',
        }}
      >
        <button
          onClick={jumpToRead}
          title="Jump to read"
          className={`absolute right-0 w-full h-1 rounded-full bg-amber-200 cursor-pointer pointer-events-auto transition-all duration-300 p-0!  hover:scale-125`}
          style={{
            top: `${calculateProgress(currentLine, lines.length - 1)}%`,
            transform: 'translateY(-50%)',
          }}
        />
      </div>

      {/* Rate Indicator */}
      <div
        id="rate-indicator"
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-4 justify-center items-center rounded-2xl p-6 z-10 pointer-events-none bg-amber-200 backdrop-blur-mg shadow-lg transition-all duration-300 ease-out ${showRateIndicator ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
      >
        <AudioLines size={24} />
        <span className="font-semibold text-xl">{speechRate}x</span>
      </div>

      {/* Side Panel */}
      <div
        id="side-panel"
        className={`fixed bottom-25 left-2 h-auto flex flex-col justify-end ${readingMode !== 'search' ? 'justify-center' : 'justify-start'} gap-1 rounded-md hover:bg-amber-200 bg-gray-200/0 z-10`}
      >
        {/* Jump to read button */}
        {showJumpButton && (
          <button
            id="jump-to-read"
            onClick={jumpToRead}
            className={`px-2! flex items-center py-1 rounded transition-all duration-300 bg-transparent ${readingMode !== 'search' ? 'text-gray-400' : 'text-gray-600'}`}
          >
            <MapPin className={`w-4 h-4 ${readingMode !== 'search' ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
        )}

        {/* Search text */}
        <button
          onClick={() => searchInputRef.current?.focus()}
          className={`px-2! flex items-center gap-0.5! py-1 rounded transition-all duration-300 ${searchText.length > 0 ? 'bg-amber-200 shadow-md' : 'bg-transparent'}`}
        >
          <Search size={14} className={`w-4 h-4 ${readingMode !== 'search' ? 'text-gray-400' : 'text-gray-600'}`} />
          {readingMode === 'search' && (
            <>
              <input
                id="search-text"
                name="search-text"
                type="text"
                ref={searchInputRef}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={async (e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) {
                      await prevMatch();
                    } else {
                      await nextMatch();
                    }
                  }
                  if (e.key === 'Escape') {
                    handleClearSearch();
                  }
                }}
                className="h-4 bg-transparent outline-none text-gray-600 text-sm"
                style={{
                  width: searchText.length > 0 ? `${Math.min(searchText.length, 20)}rem` : '1rem',
                }}
              />
              {searchText.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearSearch();
                  }}
                  className="p-0! text-gray-600 transition-colors"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
              {searchRes.length > 0 && (
                <div className={`flex items-center border-l pl-1 mx-1 text-xs text-gray-400/60 animate-in fade-in ${readingMode !== 'search' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {currentMatch + 1}/{searchRes.length}
                </div>
              )}
            </>
          )}
        </button>
      </div>

      {/* Controller Panel */}
      <div className="fixed bottom-0 left-0 h-[10vh] w-full bg-gray-50 flex justify-between items-center p-8 text-sm *:px-2 *:py-4 *:h-12">
        <button className="text-sm" onClick={() => navigateBack()} title="Back to Books">
          <LibraryBig size={16} />
        </button>

        {isPlaying ? (
          <button onClick={handlePlayPause} title="Pause">
            <Pause className="w-7 h-7 p-1.5 rounded-full bg-gray-600 text-white hover:bg-gray-700 active:bg-gray-700" />
          </button>
        ) : (
          <button onClick={handlePlayPause} title="Play">
            <Play className="w-7 h-7 p-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-700" />
          </button>
        )}

        <span className="relative p-0!" title="Select Voice">
          <label htmlFor="voice-select" className="absolute top-1/2 -translate-y-1/2 left-2">
            <UsersRound size={16} />
          </label>
          <select
            id="voice-select"
            value={selectedVoice.id}
            onClick={() => {
              if (isPlaying) isUserFocusRef.current = true;
            }}
            onChange={(e) => {
              const found = availableVoices.find((voiceOption) => voiceOption.id === e.target.value);
              if (found) setSelectedVoice(found);
              speechService.stop();
              forceControl(false, 'focus');
            }}
            className="h-full w-fit pl-4 cursor-pointer text-center bg-transparent rounded-md outline-none focus:ring-2 focus:ring-gray-200"
          >
            {availableVoices.map((voice) => (
              <option
                key={`voice-${voice.id}`}
                value={voice.id}
                style={{
                  backgroundColor: voice.enabled ? '#fff' : 'gray',
                }}
              >
                {voice.displayName}
              </option>
            ))}
          </select>
        </span>

        <span className="flex items-center" title="Text Size">
          <button onClick={() => setFontSize(fontSize + 1)} title="Text Size Up">
            <AArrowUp className="w-7 h-7 p-1.5 rounded-full bg-gray-400 text-white hover:bg-gray-700" />
          </button>
          <p>{fontSize}</p>
          <button onClick={() => setFontSize(fontSize - 1)} title="Text Size Down">
            <AArrowDown className="w-7 h-7 p-1.5 rounded-full bg-gray-400 text-white hover:bg-gray-700" />
          </button>
        </span>

        <span className="relative p-0!" title="Speech Rate">
          <label htmlFor="rate-select" className="absolute top-1/2 -translate-y-1/2 left-2">
            <AudioLines size={16} />
          </label>
          <select
            id="rate-select"
            value={speechRate}
            onClick={() => {
              if (isPlaying) isUserFocusRef.current = true;
            }}
            onChange={(e) => {
              const newRate = parseFloat(e.target.value);
              setSpeechRate(newRate);

              // Rate Indicator (Debounced)
              if (timerRef.current) clearTimeout(timerRef.current);
              setShowRateIndicator(true);
              timerRef.current = setTimeout(() => {
                setShowRateIndicator(false);
              }, 1200);

              if (isPlaying) {
                speechService.resume(currentLine, speechConfigs(newRate));
              }
              forceControl(false, 'focus');
            }}
            className="h-full min-w-30 pl-4 cursor-pointer text-center bg-transparent rounded-md outline-none focus:ring-2 focus:ring-gray-200"
          >
            {SPEECH_RATE_OPTIONS.map((rate) => (
              <option key={`rate-${rate}`} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </span>

        {book && (
          <span title={`Progress: Line ${currentLine} of ${totalLines}`} className="bg-transparent! text-gray-600 focus:ring-0! focus:outline-none!">
            {calculateProgress(currentLine, totalLines)}%
          </span>
        )}
      </div>
    </div>
  );
};
