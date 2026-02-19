import { useUpdateBook } from '@/common/useUpdateBook';
import { api } from '@/services/api';
import { speechService, type SpeechConfigs } from '@/services/SpeechService';
import { calculateProgress, type Book, type BookContent, type SpeechOptions, type TextOptions } from '@audiobook/shared';
import { AArrowDown, AArrowUp, ArrowLeft, AudioLines, LibraryBig, Loader, Pause, Play, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [error, setError] = useState<string>();
  const [showRateIndicator, setShowRateIndicator] = useState(false);
  const [currentLine, setCurrentLine] = useState<Book['currentLine']>(0);
  const [fontSize, setFontSize] = useState<NonNullable<TextOptions['fontSize']>>(18);
  const [speechRate, setSpeechRate] = useState<NonNullable<SpeechOptions['rate']>>(1.0);
  const [voice, setVoice] = useState<VoiceOption['id']>();
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICE_FALLBACK);
  const updatedBook = useMemo(
    () => ({
      currentLine,
      settings: { ...(book?.settings || {}), fontSize, rate: speechRate, voice: selectedVoice.id },
    }),
    [book?.settings, currentLine, fontSize, speechRate, selectedVoice.id],
  );
  const canUpdate = !loading && JSON.stringify(updatedBook) !== JSON.stringify({ currentLine: book?.currentLine, settings: book?.settings });

  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrollRef = useRef(true);
  const isUserFocusRef = useRef(false);

  const speechConfigs = (rate: number = speechRate): SpeechConfigs => ({ bookId: id || '', lines, lang, rate, selectedVoice });

  const availableVoices = useMemo(() => {
    const nativeVoices = speechService.getNativeVoices(lang);
    const nativeOptions: VoiceOption[] = nativeVoices.map((voice) => ({ type: 'system', id: voice.name, displayName: voice.name, enabled: true }));
    const cloudOptions: VoiceOption[] = [{ type: 'cloud', id: 'google-neural2', displayName: 'Google AI (Neural2)', enabled: true }];
    return [...(nativeOptions.length > 0 ? nativeOptions : [VOICE_FALLBACK]), ...cloudOptions];
  }, [lang]);

  const forceControl = (isUserControl: boolean = true) => {
    isUserScrollRef.current = isUserControl;
    isUserFocusRef.current = isUserControl;
  };

  const focusLine = (index: number = currentLine) => {
    lineRefs.current[index]?.focus({ preventScroll: true });
  };

  const scrollToLine = (index: number = currentLine, behavior: ScrollBehavior = 'smooth') => {
    lineRefs.current[index]?.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
  };

  const { flushUpdate } = useUpdateBook(id, updatedBook, canUpdate, setBook, focusLine);

  const handlePlayPause = () => {
    if (!id) return;
    focusLine();

    if (isPlaying) {
      speechService.stop();
    } else {
      const startFrom = currentLine >= lines.length ? 0 : currentLine;
      // if at the end, reset to start from the first line
      if (startFrom === 0) setCurrentLine(0);

      speechService.start(startFrom, speechConfigs());
    }
  };

  const handleLineClick = (lineIndex: number) => {
    setCurrentLine(lineIndex);
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
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        forceControl(false);
      }, 1000);
    }
  };

  const handleJumpToRead = () => {
    scrollToLine(currentLine, 'auto');
    focusLine();
    forceControl(false);
  };

  useEffect(() => {
    if (!id) return;

    const loadBook = async (id: string) => {
      const book = await api.books.getById(id);
      if (!book) return;

      setBook(book);
      setCurrentLine(book.currentLine || 0);
      setFontSize(book.settings?.fontSize || 18);
      setSpeechRate(book.settings?.rate || 1.0);
      setVoice(book.settings?.voice || VOICE_FALLBACK.id);
    };

    const loadBookContent = async (id: string) => {
      const content = await api.books.getContent(id);
      if (!content) return;

      setLines(content.lines);
      setLang(content.lang);
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

    loadData(id);

    speechService.onLineEnd = (lineIndex) => setCurrentLine(lineIndex);
    speechService.onIsPlayingChange = (playing) => setIsPlaying(playing);
    speechService.onFocus = (lineIndex) => focusLine(lineIndex);

    return () => {
      flushUpdate();

      speechService.stop();
      speechService.onIsPlayingChange = null;
      speechService.onLineEnd = null;

      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [id]);

  useEffect(() => {
    if (isUserScrollRef.current || !isPlaying) return;

    const handleAutoScroll = () => {
      lineRefs.current[currentLine]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      if (isUserFocusRef.current === false) lineRefs.current[currentLine]?.focus({ preventScroll: true });
    };

    handleAutoScroll();
  }, [isPlaying, currentLine]);

  useEffect(() => {
    const target = lineRefs.current[currentLine];
    if (!target || loading) return;

    lineRefs.current[currentLine]?.focus({ preventScroll: true });

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
        <button onClick={() => navigate('/', { replace: true })}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-full relative">
      <section onWheel={() => forceControl()} onTouchMove={() => forceControl()} className="relative min-h-[90vh] h-[50vh] max-h-3/4 overflow-auto px-12 pt-6 pb-6 leading-loose">
        <header className="relative text-center mb-4">
          <button className="absolute top-2 left-0 p-0!" onClick={() => navigate('/')} title="Back to Books">
            <ArrowLeft size={16} />
            <LibraryBig size={16} />
          </button>
          <h3 className="font-semibold">{book.title}</h3>
        </header>

        {showJumpButton ? (
          <button onClick={handleJumpToRead} className="fixed top-4 right-6 bg-amber-200 p-0! px-2!">
            Jump to read
          </button>
        ) : (
          <></>
        )}

        {/* Book Lines */}
        <ol
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              moveToLine(Math.min(currentLine + 1, lines.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              moveToLine(Math.max(currentLine - 1, 0));
            } else if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              handlePlayPause();
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

      {/* Rate Indicator */}
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-4 justify-center items-center rounded-2xl p-6 z-10 pointer-events-none bg-amber-200 backdrop-blur-mg shadow-lg transition-all duration-300 ease-out ${showRateIndicator ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
      >
        <AudioLines size={24} />
        <span className="font-semibold text-xl">{speechRate}x</span>
      </div>

      {/* Controller Panel */}
      <div className="fixed bottom-0 left-0 h-[10vh] w-full bg-gray-50 flex justify-between items-center p-8 text-sm [&>*]:px-2 [&>*]:py-4 [&>*]:h-12 [&>*:hover]:bg-gray-100 [&>*:hover]:rounded-lg">
        <button className="text-sm" onClick={() => navigate('/')} title="Back to Books">
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
                speechService.start(currentLine, speechConfigs(newRate));
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
          <span title={`Line ${currentLine} of ${lines.length}`} className="bg-transparent!">
            Progress: {calculateProgress(currentLine, lines.length)}%
          </span>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
};
