import { useDebounceCallback } from '@/common/useDebounceCallback';
import { api } from '@/services/api';
import { TTSNative } from '@/services/TTSNative';
import { calculateProgress, FIVE_MINUTES, type Book, type BookContent, type SpeechOptions, type TextOptions } from '@audiobook/shared';
import { AArrowDown, AArrowUp, ArrowLeft, AudioLines, LibraryBig, Loader, Pause, Play, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const SPEECH_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

type VoiceType = 'system' | 'cloud';
interface VoiceOption {
  type: VoiceType;
  id: string;
  displayName: string;
  enabled: boolean;
}
const VOICE_FALLBACK: VoiceOption = { type: 'system', id: 'system-default', displayName: 'System (Browser)', enabled: true };

const ttsNative = new TTSNative();

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
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICE_FALLBACK);

  const updatedBook = useMemo(
    () => ({
      currentLine,
      settings: { ...(book?.settings || {}), fontSize, rate: speechRate, voice: selectedVoice.id },
    }),
    [book?.settings, currentLine, fontSize, speechRate, selectedVoice.id],
  );

  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
  const silentAudioRef = useRef(new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'));
  const cloudAudioRef = useRef<HTMLAudioElement | null>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const speechRateRef = useRef(speechRate);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrollRef = useRef(true);
  const isUserFocusRef = useRef(false);
  const shouldSync = useRef(false);

  const availableVoices = useMemo(() => {
    const nativeVoices = ttsNative.getVoices({ lang: lang });
    const nativeOptions: VoiceOption[] = nativeVoices.map((voice) => ({ type: 'system', id: voice.name, displayName: voice.name, enabled: true }));
    const cloudOptions: VoiceOption[] = [{ type: 'cloud', id: 'google-neural2', displayName: 'Google AI (Neural2)', enabled: true }];
    return [...(nativeOptions.length > 0 ? nativeOptions : [VOICE_FALLBACK]), ...cloudOptions];
  }, [lang]);

  const loadBook = async (id: string) => {
    const book = await api.books.getById(id);
    if (!book) return;

    setBook(book);
    setCurrentLine(book.currentLine || 0);
    setFontSize(book.settings?.fontSize || 18);
    setSpeechRate(book.settings?.rate || 1.0);
    const found = availableVoices.find((voice) => voice.id === book.settings?.voice);
    if (found) setSelectedVoice(found);
  };

  const loadBookContent = async (id: string) => {
    const content = await api.books.getContent(id);
    if (!content) return;

    setLines(content.lines);
    setLang(content.lang);
  };

  const handlePlayPause = () => {
    isUserFocusRef.current = false;
    if (isPlaying) {
      stopSpeech();
    } else {
      setIsPlaying(true);
      // if at the end, reset to start from the first line
      if (currentLine >= lines.length) {
        setCurrentLine(0);
        startSpeech(0);
      } else {
        startSpeech(currentLine);
      }
    }
  };

  const handleLineClick = (lineIndex: number) => {
    setCurrentLine(lineIndex);
    if (isPlaying) {
      stopSpeech();
    }
    setTimeout(() => {
      isUserScrollRef.current = false;
      isUserFocusRef.current = false;
    }, 100);
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

  const startSpeech = (index: number) => {
    if (index >= lines.length) {
      setIsPlaying(false);
      playButtonRef.current?.focus();
      return;
    }

    // Kick off the silent audio loop to "claim" the hardware buttons
    const audio = silentAudioRef.current;
    audio.loop = true;
    audio.play().catch((e) => console.error('Audio play failed:', e));

    // Explicitly set the Playback State (Crucial for iOS)
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

    if (selectedVoice.type === 'cloud') {
      ttsNative.stop();
      startCloudSpeech(index);
    }

    if (selectedVoice.type === 'system') {
      if (cloudAudioRef.current) cloudAudioRef.current.pause();
      startSystemSpeech(index);
    }
  };

  const startCloudSpeech = (startIndex: number) => {
    let current = startIndex;

    if (!cloudAudioRef.current) {
      cloudAudioRef.current = new Audio();
      cloudAudioRef.current.onerror = () => setIsPlaying(false);
    }

    // Set source to server route
    // The speechRate is applied directly to the audio element
    cloudAudioRef.current.src = `/api/books/${id}/audio/${startIndex}`;
    cloudAudioRef.current.playbackRate = speechRateRef.current;

    cloudAudioRef.current.onended = () => {
      current++;
      setCurrentLine(current);
      startCloudSpeech(current);
    };

    cloudAudioRef.current.play().catch((e) => console.error('Playback failed:', e));
  };

  const startSystemSpeech = (startIndex: number) => {
    let current = startIndex;

    ttsNative.speak(
      lines[current],
      { lang: lang, rate: speechRateRef.current, voice: selectedVoice.id },
      () => {
        current++;
        setCurrentLine(current);
        startSystemSpeech(current);
      },
      () => setIsPlaying(false),
    );
  };

  const stopSpeech = () => {
    if (silentAudioRef.current) silentAudioRef.current.pause();

    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';

    // Cloud cleanup
    if (cloudAudioRef.current) {
      cloudAudioRef.current.pause();
      cloudAudioRef.current.onended = null;
      cloudAudioRef.current.src = '';
      cloudAudioRef.current = null;
    }

    // System cleanup
    ttsNative.stop();

    setIsPlaying(false);
  };

  const handleJumpToRead = () => {
    isUserScrollRef.current = false;
    isUserFocusRef.current = false;
    lineRefs.current[currentLine]?.scrollIntoView({ behavior: 'auto', block: 'center' });
    setTimeout(() => {
      isUserScrollRef.current = false;
      isUserFocusRef.current = false;
    }, 100);
  };

  useEffect(() => {
    if (!id) return;

    const loadData = async (id: string) => {
      try {
        await Promise.all([loadBook(id), loadBookContent(id)]);
      } catch (error) {
        setError('Failed to load book');
        console.error('Failed to load book: ', error);
      } finally {
        setLoading(false);
        setTimeout(() => {
          playButtonRef.current?.focus();
        }, 100);
      }
    };

    loadData(id);
  }, [id]);

  useEffect(() => {
    const handlePageVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (shouldSync.current) return;

        shouldSync.current = true;
        flushUpdate();
      } else if (document.visibilityState === 'visible') {
        shouldSync.current = false;
        setTimeout(() => {
          playButtonRef.current?.focus();
        }, 100);
      }
    };

    document.addEventListener('visibilitychange', handlePageVisibility);
    window.addEventListener('pagehide', handlePageVisibility);

    return () => {
      stopSpeech();
      ttsNative.stop();

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
    if (isUserScrollRef.current || !isPlaying) return;

    lineRefs.current[currentLine]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    if (isUserFocusRef.current === false) lineRefs.current[currentLine]?.focus({ preventScroll: true });
  }, [isPlaying, currentLine]);

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
        onWheel={() => (isUserScrollRef.current = true)}
        onTouchMove={() => (isUserScrollRef.current = true)}
        className="relative min-h-[90vh] h-[50vh] max-h-3/4 overflow-auto px-12 pt-6 pb-6 leading-loose"
      >
        <header className="relative text-center mb-4">
          <button className="absolute top-2 left-0 p-0!" onClick={() => navigate('/')} title="Back to Books">
            <ArrowLeft size={16} />
            <LibraryBig size={16} />
          </button>
          <h3 className="font-semibold">{book.title}</h3>
        </header>

        {showJumpButton && isPlaying ? (
          <button onClick={handleJumpToRead} className="fixed top-4 right-2 bg-amber-200 p-0! px-2!">
            Jump to read
          </button>
        ) : (
          <></>
        )}

        {/* Book Lines */}
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
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-4 justify-center items-center rounded-2xl p-6 z-10 pointer-events-none bg-amber-400 backdrop-blur-mg shadow-lg transition-all duration-300 ease-out ${showRateIndicator ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
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
          <select
            value={selectedVoice.id}
            onClick={() => {
              if (isPlaying) isUserFocusRef.current = true;
            }}
            onChange={(e) => {
              const found = availableVoices.find((voice) => voice.id === e.target.value);
              if (found) setSelectedVoice(found);
              stopSpeech();
              playButtonRef.current?.focus();
            }}
            className="cursor-pointer text-center bg-transparent focus:outline-none"
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

        <span className="flex items-center gap-1" title="Speech Rate">
          <label>
            <AudioLines size={16} />
          </label>
          <select
            onClick={() => {
              if (isPlaying) isUserFocusRef.current = true;
            }}
            onChange={(e) => {
              const newRate = parseFloat(e.target.value);
              setSpeechRate(newRate);
              speechRateRef.current = newRate;
              if (timerRef.current) clearTimeout(timerRef.current);
              setShowRateIndicator(true);
              timerRef.current = setTimeout(() => {
                setShowRateIndicator(false);
              }, 1200);
              if (isPlaying) {
                stopSpeech();
                setTimeout(() => {
                  setIsPlaying(true);
                  startSpeech(currentLine);
                }, 100);
              }
            }}
            value={speechRate}
            className="cursor-pointer text-center bg-transparent focus:outline-none"
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
