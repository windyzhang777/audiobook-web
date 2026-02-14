import { useDebounceCallback } from '@/common/useDebounceCallback';
import { api } from '@/services/api';
import { calculateProgress, FIVE_MINUTES, type Book, type BookContent, type SpeechOptions, type TextOptions } from '@audiobook/shared';
import { AArrowDown, AArrowUp, ArrowLeft, AudioLines, BookmarkPlus, LibraryBig, Loader, Pause, Play, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const SPEECH_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export const BookReader = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [book, setBook] = useState<Book>();
  const [lines, setLines] = useState<BookContent['lines']>([]);
  const [langCode, setLangCode] = useState('eng');
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [error, setError] = useState<string>();
  const [currentLine, setCurrentLine] = useState<Book['currentLine']>(0);
  const [fontSize, setFontSize] = useState<NonNullable<TextOptions['fontSize']>>(18);
  const [speechRate, setSpeechRate] = useState<NonNullable<SpeechOptions['rate']>>(1.0);
  const updatedBook = useMemo(
    () => ({
      currentLine,
      settings: { ...(book?.settings || {}), fontSize, rate: speechRate },
    }),
    [book?.settings, currentLine, fontSize, speechRate],
  );

  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
  const silentAudioRef = useRef(new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'));
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldSync = useRef(false);

  const loadBook = async (id: string) => {
    const book = await api.books.getById(id);
    if (!book) return;

    setBook(book);
    setCurrentLine(book.currentLine || 0);
    setFontSize(book.settings?.fontSize || 18);
    setSpeechRate(book.settings?.rate || 1.0);
    playButtonRef.current?.focus();
  };

  const loadBookContent = async (id: string) => {
    const content = await api.books.getContent(id);
    if (!content) return;

    setLines(content.lines);
    setLangCode(content.langCode);
  };

  const loadData = async (id: string) => {
    try {
      await Promise.all([loadBook(id), loadBookContent(id)]);
    } catch (error) {
      setError('Failed to load book');
      console.error('Failed to load book: ', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      stopUtterance();
    } else {
      setIsPlaying(true);
      // if at the end, reset to start from the first line
      if (currentLine >= lines.length) {
        setCurrentLine(0);
        startUtterance(0);
      } else {
        startUtterance(currentLine);
      }
    }
  };

  const handleLineClick = (lineIndex: number) => {
    setIsScrolling(false);
    setCurrentLine(lineIndex);
    if (isPlaying) {
      stopUtterance();
    }
  };

  const handleBookUpdate = async (updatedBook: Partial<Book>) => {
    if (!id) return;

    try {
      await api.books.update(id, updatedBook);
      setBook((prev) => (prev ? { ...prev, ...updatedBook } : prev));
    } catch (error) {
      console.error('Failed to update book: ', updatedBook, error);
    }
  };

  const { run: debounceUpdate, flush: flushUpdate } = useDebounceCallback(handleBookUpdate, FIVE_MINUTES);

  // TODO: add cloud over native browser TTS
  const startUtterance = (startIndex: number) => {
    // Kick off the silent audio loop to "claim" the hardware buttons
    const audio = silentAudioRef.current;
    audio.loop = true;
    audio.play().catch((e) => console.error('Audio play failed:', e));

    // Explicitly set the Playback State (Crucial for iOS)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }

    speechSynthesis.cancel(); // cancel any ongoing speech

    // speak all lines from startIndex to end
    let current = startIndex;
    const speakNext = () => {
      if (current >= lines.length) {
        setIsPlaying(false);
        playButtonRef.current?.focus();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(lines[current]);
      utterance.lang = langCode;
      utterance.rate = speechRate;
      utterance.onend = () => {
        current++;
        setCurrentLine(current);
        speakNext();
      };
      utterance.onerror = () => {
        setIsPlaying(false);
      };
      utteranceRef.current = utterance;
      speechSynthesis.speak(utterance);
    };

    speakNext();
  };

  const stopUtterance = () => {
    if (silentAudioRef.current) {
      silentAudioRef.current.pause();
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }

    if (utteranceRef.current) utteranceRef.current.onend = null;
    speechSynthesis.cancel();
    setIsPlaying(false);
  };

  const toggleFontSize = (fontSize: number) => {
    setFontSize(fontSize);
  };

  const toggleSpeechRate = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rate = parseFloat(e.target.value);
    setSpeechRate(rate);
    if (isPlaying) stopUtterance();
    playButtonRef.current?.focus();
  };

  useEffect(() => {
    if (!id) return;

    loadData(id);

    const handlePageVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (shouldSync.current) return;

        shouldSync.current = true;
        flushUpdate();
      } else {
        shouldSync.current = false;
      }
    };

    document.addEventListener('visibilitychange', handlePageVisibility);
    window.addEventListener('pagehide', handlePageVisibility);

    return () => {
      stopUtterance();

      document.removeEventListener('visibilitychange', handlePageVisibility);
      window.removeEventListener('pagehide', handlePageVisibility);
    };
  }, [id]);

  useEffect(() => {
    const hasUpdated = JSON.stringify(updatedBook) !== JSON.stringify({ currentLine: book?.currentLine, settings: book?.settings });

    if (!loading && book && updatedBook && hasUpdated) {
      debounceUpdate(updatedBook);
    }
  }, [debounceUpdate, loading, book, updatedBook]);

  useEffect(() => {
    return () => flushUpdate();
  }, [flushUpdate]);

  useEffect(() => {
    if (isScrolling || !isPlaying) return;

    lineRefs.current[currentLine]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    lineRefs.current[currentLine]?.focus({ preventScroll: true });
  }, [isScrolling, isPlaying, currentLine]);

  useEffect(() => {
    const target = lineRefs.current[currentLine];
    if (!target || loading) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowJumpButton(!entry.isIntersecting);
      },
      { root: null, threshold: 0.5 },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [currentLine, loading]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      // Set the Play/Pause handlers (AirPod Taps)
      navigator.mediaSession.setActionHandler('play', () => handlePlayPause());

      navigator.mediaSession.setActionHandler('pause', () => handlePlayPause());

      // Map skip buttons to lines
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        const next = Math.min(currentLine + 1, lines.length - 1);
        handleLineClick(next);
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        const prev = Math.max(currentLine - 1, 0);
        handleLineClick(prev);
      });
    }

    // Cleanup handlers when component unmounts
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
      }
    };
  }, [currentLine, handlePlayPause]);

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
        <button onClick={() => navigate('/', { replace: true })}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-full relative">
      <section
        onScroll={() => {
          setIsScrolling(true);

          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

          scrollTimeoutRef.current = setTimeout(() => {
            setIsScrolling(false);
          }, 2000);
        }}
        className="min-h-[90vh] h-[50vh] max-h-3/4 overflow-auto px-12 pt-6 leading-loose"
      >
        <header className="relative text-center mb-4">
          <button className="absolute top-2 left-0 p-0!" onClick={() => navigate('/')} title="Back to Books">
            <ArrowLeft size={16} />
            <LibraryBig size={16} />
          </button>
          <h3 className="font-semibold">{book.title}</h3>
        </header>

        {showJumpButton ? (
          <button
            onClick={() => {
              setIsScrolling(false);
              lineRefs.current[currentLine]?.scrollIntoView({ behavior: 'auto', block: 'center' });
              playButtonRef.current?.focus();
            }}
            className="fixed top-4 right-2"
            title="Jump to last read"
          >
            <BookmarkPlus fill="orange" strokeWidth={1.2} />
          </button>
        ) : (
          <></>
        )}

        <ol
          onKeyDown={(e) => {
            let nextLine = currentLine;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (isPlaying) handlePlayPause();
              nextLine = Math.min(currentLine + 1, lines.length - 1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (isPlaying) handlePlayPause();
              nextLine = Math.max(currentLine - 1, 0);
            } else if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              handlePlayPause();
              return;
            }

            if (nextLine !== currentLine) {
              setCurrentLine(nextLine);
              lineRefs.current[nextLine]?.scrollIntoView({ behavior: 'auto', block: 'center' });
              lineRefs.current[nextLine]?.focus();
            }
          }}
          className="text-left"
          style={{ fontSize }}
        >
          {lines.map((line, index) => (
            <li
              key={`line-${index}`}
              role="button"
              tabIndex={index === currentLine ? 0 : -1}
              aria-current={index === currentLine ? 'location' : undefined}
              aria-label={`Line ${index}`}
              ref={(el) => {
                lineRefs.current[index] = el;
              }}
              onDoubleClick={() => handleLineClick(index)}
              className={`cursor-pointer transition-all duration-200 ease-in-out rounded-lg ${index === currentLine ? 'bg-amber-100 font-medium outline-2 outline-amber-100' : ''}`}
            >
              {line}
            </li>
          ))}
        </ol>
      </section>

      {/* Controller Panel */}
      <div className="fixed bottom-0 left-0 h-[10vh] w-full bg-gray-50 flex justify-between items-center p-8 text-sm [&>*]:px-2 [&>*]:py-4 [&>*]:h-12 [&>*:hover]:bg-gray-100 [&>*:hover]:rounded-lg">
        <button className="text-sm" onClick={() => navigate('/')} title="Back to Books">
          <LibraryBig size={16} />
        </button>

        {isPlaying ? (
          <button ref={playButtonRef} onClick={handlePlayPause} title="Pause">
            <Pause className="w-7 h-7 p-1.5 rounded-full bg-gray-600 text-white hover:bg-gray-700 active:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50" />
          </button>
        ) : (
          <button ref={playButtonRef} onClick={handlePlayPause} title="Play">
            <Play className="w-7 h-7 p-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50" />
          </button>
        )}

        <span className="flex items-center gap-1" title="Select Voice">
          <UsersRound size={16} />
          <select onChange={toggleSpeechRate} value={speechRate} className="cursor-pointer text-center">
            {['system'].map((voice) => (
              <option key={`voice-${voice}`} value={voice}>
                {voice}
              </option>
            ))}
          </select>
        </span>

        <span className="flex items-center" title="Text Size">
          <button onClick={() => toggleFontSize(fontSize + 1)} title="Text Size Up">
            <AArrowUp className="w-7 h-7 p-1.5 rounded-full bg-gray-400 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50" />
          </button>
          <p>{fontSize}</p>
          <button onClick={() => toggleFontSize(fontSize - 1)} title="Text Size Down">
            <AArrowDown className="w-7 h-7 p-1.5 rounded-full bg-gray-400 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50" />
          </button>
        </span>

        <span className="flex items-center gap-1" title="Speech Rate">
          <label>
            <AudioLines size={16} />
          </label>
          <select onChange={toggleSpeechRate} value={speechRate} className="cursor-pointer text-center">
            {SPEECH_RATE_OPTIONS.map((rate) => (
              <option key={`rate-${rate}`} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </span>

        {book ? (
          <span title={`Line ${currentLine} of ${lines.length}`} className="bg-transparent!">
            Progress: {calculateProgress(book.currentLine, book.totalLines)}%
          </span>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
};
