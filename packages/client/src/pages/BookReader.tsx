import { useUpdateBook } from '@/common/useUpdateBook';
import { triggerSuccess } from '@/helper';
import { api } from '@/services/api';
import { speechService, type SpeechConfigs } from '@/services/SpeechService';
import { calculateProgress, PAGE_SIZE, type Book, type BookContent, type SpeechOptions, type TextOptions } from '@audiobook/shared';
import { AArrowDown, AArrowUp, ArrowLeft, AudioLines, LibraryBig, Loader, Loader2, Pause, Play, UsersRound } from 'lucide-react';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Virtuoso, type LocationOptions, type VirtuosoHandle } from 'react-virtuoso';

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

  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const forceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrollRef = useRef(true);
  const isUserFocusRef = useRef(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const speechConfigs = (rate: number = speechRate): SpeechConfigs => ({ bookId: id || '', lines, lang, rate, selectedVoice });

  const availableVoices = useMemo(() => {
    const nativeVoices = speechService.getNativeVoices(lang);
    const nativeOptions: VoiceOption[] = nativeVoices.map((voice) => ({ type: 'system', id: voice.name, displayName: voice.name, enabled: true }));
    const cloudOptions: VoiceOption[] = [{ type: 'cloud', id: 'google-neural2', displayName: 'Google AI (Neural2)', enabled: true }];
    return [...(nativeOptions.length > 0 ? nativeOptions : [VOICE_FALLBACK]), ...cloudOptions];
  }, [lang]);

  const navigateBack = async (replace: boolean = false) => {
    await flushUpdate();
    navigate('/', { replace });
  };

  const forceControl = (isUserControl: boolean = true) => {
    isUserScrollRef.current = isUserControl;
    isUserFocusRef.current = isUserControl;
  };

  const focusLine = (index: number = currentLine) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const el = lineRefs.current[index];
      if (el) {
        el.focus({ preventScroll: true });
      } else {
        const list = document.querySelector('[data-virtuoso-list]');
        (list as HTMLElement)?.focus({ preventScroll: true });
      }
    }, 100);
  };

  const scrollToLine = (index: number = currentLine, behavior: LocationOptions['behavior'] = 'smooth') => {
    virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior });
  };

  const handlePlayPause = () => {
    if (!id) return;
    focusLine();

    if (isPlaying) {
      speechService.stop();
    } else {
      const startFrom = currentLine >= totalLines ? 0 : currentLine;
      // if at the end, reset to start from the first line
      if (startFrom === 0) setCurrentLine(0);

      speechService.start(startFrom, speechConfigs());
    }
  };

  const handleLineClick = (lineIndex: number) => {
    setCurrentLine(lineIndex);
    focusLine(lineIndex);

    if (isPlaying) {
      speechService.resume(lineIndex, speechConfigs());
      forceControl(false);
    }
  };

  const moveToLine = (lineIndex: number) => {
    if (lineIndex == currentLine) return;

    forceControl();
    setCurrentLine(lineIndex);
    scrollToLine(lineIndex);
    focusLine(lineIndex);

    if (isPlaying) {
      speechService.resume(lineIndex, speechConfigs());
      if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
      forceTimerRef.current = setTimeout(() => {
        forceControl(false);
      }, 100);
    }
  };

  const handleJumpToRead = () => {
    scrollToLine(currentLine, 'auto');
    focusLine();
    forceControl(false);
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

  const { flushUpdate } = useUpdateBook(id, updatedBook, canUpdate, setBook, focusLine);

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

        await loadBookContent(id, 0, (book.currentLine || 0) + PAGE_SIZE);
      } catch (error) {
        setError('Failed to load book');
        console.error('Failed to load book: ', error);
      } finally {
        setLoading(false);
        setTimeout(() => {
          focusLine();
        }, 300);
      }
    };

    loadBook(id);

    speechService.onLineEnd = (lineIndex) => setCurrentLine(lineIndex);
    speechService.onIsPlayingChange = (playing) => setIsPlaying(playing);
    speechService.onFocus = (lineIndex) => focusLine(lineIndex);
    speechService.onBookCompleted = (date) => {
      triggerSuccess();
      setLastCompleted(date);
    };

    return () => {
      speechService.stop();
      speechService.onLineEnd = null;
      speechService.onIsPlayingChange = null;
      speechService.onFocus = null;
      speechService.onBookCompleted = null;

      if (timerRef.current) clearTimeout(timerRef.current);
      if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
    };
  }, [id]);

  useEffect(() => {
    if (isUserScrollRef.current || !isPlaying) return;

    const focusLine = (index: number = currentLine) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const el = lineRefs.current[index];
        if (el) {
          el.focus({ preventScroll: true });
        } else {
          const list = document.querySelector('[data-virtuoso-list]');
          (list as HTMLElement)?.focus({ preventScroll: true });
        }
      }, 100);
    };

    const handleAutoScroll = () => {
      virtuosoRef.current?.scrollToIndex({ index: currentLine, align: 'center', behavior: 'smooth' });
      if (isUserFocusRef.current === false) focusLine();
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
        ref={virtuosoRef}
        style={{ paddingTop: '1.5rem' }}
        className="min-h-[90vh] h-[50vh] max-h-3/4 w-full  leading-loose"
        data={lines}
        initialTopMostItemIndex={{ index: 0, align: 'center' }}
        increaseViewportBy={200}
        endReached={() => {
          if (!id || !hasMore || loadingMore) return;
          loadMoreLines(id, lines.length);
        }}
        atBottomStateChange={(atBottom) => {
          if (!id) return;

          if (atBottom && hasMore && !loadingMore) {
            // Force a fetch if the user is stuck at the bottom
            loadMoreLines(id, lines.length);
          }
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
              onWheel={() => forceControl()}
              onTouchMove={() => forceControl()}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  moveToLine(Math.min(currentLine + 1, totalLines - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  moveToLine(Math.max(currentLine - 1, 0));
                } else if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handlePlayPause();
                }
              }}
              className="list-none text-left px-12"
              style={{ ...style, fontSize }}
            >
              {children}
            </div>
          )),
          Footer: () => (
            <div ref={loadMoreTriggerRef} className="h-20 w-full flex justify-center items-center text-sm text-gray-300">
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
        itemContent={(index, line) => (
          <li
            key={`line-${index}`}
            role="button"
            tabIndex={index === currentLine ? 0 : -1}
            aria-current={index === currentLine ? 'location' : undefined}
            ref={(el) => {
              lineRefs.current[index] = el;
            }}
            onDoubleClick={() => handleLineClick(index)}
            className={`cursor-pointer px-2 transition-colors duration-200 ease-in-out rounded-lg ${index === currentLine ? 'bg-amber-100 font-medium' : ''} focus:none focus-visible:none`}
          >
            {line}
          </li>
        )}
      />

      {/* Scroobar Marker */}
      <div
        className="absolute top-3 right-0.5 w-3 pointer-events-none z-10"
        style={{
          minHeight: 'calc(90vh - 1.5rem)',
          height: 'calc(50vh - 1.5rem)',
          maxHeight: 'calc(75% - 1.5rem)',
        }}
      >
        <button
          onClick={handleJumpToRead}
          title="Jump to read"
          className={`absolute right-0 w-full h-1 rounded-full bg-amber-200 cursor-pointer pointer-events-auto transition-all duration-300 p-0! focus:outline-none! hover:scale-125`}
          style={{
            top: `${calculateProgress(currentLine, lines.length - 1)}%`,
            transform: 'translateY(-50%)',
          }}
        />
      </div>

      {/* Jump to read button */}
      {showJumpButton ? (
        <button onClick={handleJumpToRead} className="fixed top-4 right-6 bg-amber-200 px-2!">
          Jump to read
        </button>
      ) : (
        <></>
      )}

      {/* Rate Indicator */}
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-4 justify-center items-center rounded-2xl p-6 z-10 pointer-events-none bg-amber-200 backdrop-blur-mg shadow-lg transition-all duration-300 ease-out ${showRateIndicator ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
      >
        <AudioLines size={24} />
        <span className="font-semibold text-xl">{speechRate}x</span>
      </div>

      {/* Controller Panel */}
      <div className="fixed bottom-0 left-0 h-[10vh] w-full bg-gray-50 flex justify-between items-center p-8 text-sm [&>*]:px-2 [&>*]:py-4 [&>*]:h-12 [&>*:hover]:bg-gray-100 [&>*:hover]:rounded-lg">
        <button className="text-sm" onClick={() => navigateBack()} title="Back to Books">
          <LibraryBig size={16} />
        </button>

        {isPlaying ? (
          <button onClick={handlePlayPause} title="Pause">
            <Pause className="w-7 h-7 p-1.5 rounded-full bg-gray-600 text-white hover:bg-gray-700 active:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50" />
          </button>
        ) : (
          <button onClick={handlePlayPause} title="Play">
            <Play className="w-7 h-7 p-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50" />
          </button>
        )}

        <span className="relative p-0!" title="Select Voice">
          <label htmlFor="voice-select" className="absolute top-1/2 -translate-y-1/2 left-0">
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
              focusLine();
            }}
            className="h-full w-fit pl-4 cursor-pointer text-center bg-transparent focus:outline-none"
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
            <AArrowUp className="w-7 h-7 p-1.5 rounded-full bg-gray-400 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50" />
          </button>
          <p>{fontSize}</p>
          <button onClick={() => setFontSize(fontSize - 1)} title="Text Size Down">
            <AArrowDown className="w-7 h-7 p-1.5 rounded-full bg-gray-400 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50" />
          </button>
        </span>

        <span className="relative p-0!" title="Speech Rate">
          <label htmlFor="rate-select" className="absolute top-1/2 -translate-y-1/2 left-0">
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
            }}
            className="h-full min-w-30 pl-4 cursor-pointer text-center bg-transparent focus:outline-none"
          >
            {SPEECH_RATE_OPTIONS.map((rate) => (
              <option key={`rate-${rate}`} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </span>

        {book ? (
          <span title={`Line ${currentLine} of ${totalLines}`} className="bg-transparent!">
            Progress: {calculateProgress(currentLine, totalLines)}%
          </span>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
};
