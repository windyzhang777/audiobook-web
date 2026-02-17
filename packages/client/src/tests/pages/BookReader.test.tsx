import { BookReader } from '@/pages/BookReader';
import { api } from '@/services/api';
import type { Book, BookContent } from '@audiobook/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Browser APIs
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const mockSpeak = vi.fn();
const mockCancel = vi.fn();
global.speechSynthesis = {
  speak: mockSpeak,
  cancel: mockCancel,
  pause: vi.fn(),
  getVoices: vi.fn().mockReturnValue([]),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
} as unknown as SpeechSynthesis;

global.SpeechSynthesisUtterance = vi.fn().mockImplementation(function (text: string) {
  return {
    text,
    lang: '',
    rate: 1,
    onend: null,
    onerror: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}) as unknown as typeof SpeechSynthesisUtterance;

// Mock Audio
global.Audio = vi.fn().mockImplementation(function () {
  return {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    loop: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}) as unknown as typeof Audio;

// Mock MediaSession
const mockSetActionHandler = vi.fn();
Object.defineProperty(navigator, 'mediaSession', {
  value: {
    setActionHandler: mockSetActionHandler,
    playbackState: 'none',
  },
  configurable: true,
  writable: true,
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(function () {
  return {
    observe: vi.fn(),
    disconnect: vi.fn(),
  };
});

vi.mock('@/services/api', () => ({
  api: {
    books: {
      getById: vi.fn(),
      getContent: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/common/useDebounceCallback', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useDebounceCallback: (fn: any) => ({
    run: fn,
    flush: vi.fn(),
    cancel: vi.fn(),
  }),
}));

const renderWithRouter = (id: string) => {
  return render(
    <MemoryRouter initialEntries={[`/book/${id}`]}>
      <Routes>
        <Route path="/book/:id" element={<BookReader />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('<BookReader />', () => {
  const mockBook = {
    id: '123',
    title: 'Test Book',
    currentLine: 0,
    totalLines: 2,
    settings: { fontSize: 18, rate: 1 },
  } as Book;
  const mockContent = {
    lines: ['Line 1', 'Line 2'],
    lang: 'en',
  } as BookContent;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.books.getById).mockResolvedValue(mockBook);
    vi.mocked(api.books.getContent).mockResolvedValue(mockContent);
  });

  it('loads and displays book content', async () => {
    renderWithRouter('123');

    // Wait for loader to disappear and text to appear
    expect(await screen.findByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('Line 2')).toBeInTheDocument();
  });

  it('starts playback and calls speechSynthesis on play click', async () => {
    renderWithRouter('123');
    await screen.findByText('Line 1');

    const playBtn = screen.getByRole('button', { name: /play/i });
    fireEvent.click(playBtn);

    expect(mockSpeak).toHaveBeenCalled();
    expect(navigator.mediaSession.playbackState).toBe('playing');
  });

  it('updates current line when a line is clicked', async () => {
    renderWithRouter('123');
    await screen.findByText('Line 1');

    const secondLine = screen.getByText('Line 2');
    fireEvent.doubleClick(secondLine);

    // Check if the doubleClicked line gets the active class (bg-amber-100)
    expect(secondLine).toHaveClass('bg-amber-100');
  });

  it('sets up mediaSession handlers for AirPod support', async () => {
    renderWithRouter('123');
    await screen.findByText('Line 1');

    expect(mockSetActionHandler).toHaveBeenCalledWith('play', expect.any(Function));
    expect(mockSetActionHandler).toHaveBeenCalledWith('pause', expect.any(Function));
    expect(mockSetActionHandler).toHaveBeenCalledWith('nexttrack', expect.any(Function));
  });

  it('stops utterance and audio loop on unmount', async () => {
    const { unmount } = renderWithRouter('123');
    await screen.findByText('Line 1');

    unmount();
    expect(mockCancel).toHaveBeenCalled();
  });
});
