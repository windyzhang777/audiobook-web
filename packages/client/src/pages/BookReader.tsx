import { calculateProgress, type Book, type BookContent, type SpeechOptions, type TextOptions } from '@audiobook/shared';
import { ArrowLeft, LibraryBig, Loader, Minus, Pause, Play, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDebounceCallback } from '../common/useDebounceCallback';
import { api } from '../services/api';

const SPEECH_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export const BookReader = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [book, setBook] = useState<Book>();
  const [lines, setLines] = useState<BookContent['lines']>([]);
  const [langCode, setLangCode] = useState('eng');
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string>();
  const [currentLine, setCurrentLine] = useState<Book['currentLine']>(0);
  const [fontSize, setFontSize] = useState<NonNullable<TextOptions['fontSize']>>(18);
  const [speechRate, setSpeechRate] = useState<NonNullable<SpeechOptions['rate']>>(1.0);
  const updatedBook = useMemo(() => ({ currentLine, settings: { ...(book?.settings || {}), fontSize, rate: speechRate } }), [book?.settings, currentLine, fontSize, speechRate]);

  const isInitialLoad = useRef(true);
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const isNavigatingRef = useRef(false);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBook = async (id: string) => {
    try {
      const book = await api.books.getById(id);
      if (!book) return;

      setBook(book);
      setCurrentLine(book.currentLine || 0);
      setFontSize(book.settings?.fontSize || 18);
      setSpeechRate(book.settings?.rate || 1.0);
      playButtonRef.current?.focus();
    } catch (error) {
      setError('Failed to load book');
      console.error('Failed to load book: ', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBookContent = async (id: string) => {
    try {
      const content = await api.books.getContent(id);
      if (!content) return;

      setLines(content.lines);
      setLangCode(content.langCode);
    } catch (error) {
      setError('Failed to load book content');
      console.error('Failed to load book content: ', error);
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
    isNavigatingRef.current = false;
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

  const debounceUpdate = useDebounceCallback(handleBookUpdate);

  // TODO: add cloud over native browser TTS
  const startUtterance = (startIndex: number) => {
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
  };

  useEffect(() => {
    if (id) {
      loadBook(id).then(() => setTimeout(() => (isInitialLoad.current = false), 100));
      loadBookContent(id);
    }
    return () => {
      stopUtterance();
    };
  }, [id]);

  useEffect(() => {
    if (!loading && !isInitialLoad.current && updatedBook) {
      debounceUpdate(updatedBook);
    }
  }, [updatedBook, debounceUpdate, loading]);

  useEffect(() => {
    console.log(`isNavigatingRef.current :`, isNavigatingRef.current);
    if (isNavigatingRef.current) return;

    if (isPlaying) {
      lineRefs.current[currentLine]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      lineRefs.current[currentLine]?.focus({ preventScroll: true });
    }
  }, [isPlaying, currentLine]);

  if (loading) {
    return (
      <div className="min-h-full flex justify-center items-center gap-2">
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
      <section className="min-h-[90vh] h-[50vh] max-h-3/4 overflow-auto px-4 py-6 leading-loose">
        <header className="relative text-center mb-4">
          <button className="absolute top-2 left-0 p-0!" onClick={() => navigate('/')} title="Back to Books">
            <ArrowLeft size={16} />
            <LibraryBig size={16} />
          </button>
          <h3 className="font-semibold">{book.title}</h3>
        </header>

        <ol
          onWheel={() => {
            isNavigatingRef.current = true;
            if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
            navTimeoutRef.current = setTimeout(() => {
              isNavigatingRef.current = false;
            }, 2000);
          }}
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
              aria-current={index === currentLine ? 'step' : undefined}
              ref={(el) => {
                lineRefs.current[index] = el;
              }}
              onClick={() => handleLineClick(index)}
              className={`cursor-pointer transition-all duration-200 ease-in-out rounded-lg ${index === currentLine ? 'bg-amber-100 font-medium outline-2 outline-amber-100' : ''}`}
            >
              {line}
            </li>
          ))}
        </ol>
      </section>

      {/* Controller Panel */}
      <div className="fixed bottom-0 left-0 h-[10vh] w-full bg-gray-50 flex justify-between items-center p-8 text-sm">
        <button className="text-sm" onClick={() => navigate('/')} title="Back to Books">
          <LibraryBig size={16} />
        </button>

        {isPlaying ? (
          <button ref={playButtonRef} onClick={handlePlayPause} className="w-32!">
            <Pause className="w-7 h-7 p-1.5 rounded-full bg-gray-600 text-white hover:bg-gray-700 active:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50" />
            Pause
          </button>
        ) : (
          <button ref={playButtonRef} onClick={handlePlayPause} className="w-32!">
            <Play className="w-7 h-7 p-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50" />
            Play
          </button>
        )}

        <span className="flex items-center gap-1">
          <button onClick={() => toggleFontSize(fontSize + 1)}>
            <Plus className="w-7 h-7 p-1.5 rounded-full bg-gray-400 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50" />
          </button>
          <p>Font Size {fontSize}</p>
          <button onClick={() => toggleFontSize(fontSize - 1)}>
            <Minus className="w-7 h-7 p-1.5 rounded-full bg-gray-400 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50" />
          </button>
        </span>

        <span className="flex items-center gap-1 w-20">
          <label>Speed:</label>
          <select onChange={toggleSpeechRate} value={speechRate} className="cursor-pointer">
            {SPEECH_RATE_OPTIONS.map((rate) => (
              <option key={`rate-${rate}`} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </span>

        <span>Progress: {calculateProgress(book.currentLine, book.totalLines)}%</span>
      </div>
    </div>
  );
};
