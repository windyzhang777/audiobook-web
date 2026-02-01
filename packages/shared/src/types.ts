type BookSource = 'local' | 'cloud';

export type BookFileType = 'txt' | 'epub' | 'pdf' | 'mobi';

export interface SpeechOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: unknown;
}

export interface TextOptions {
  fontSize?: number;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
}

export interface Book {
  id: string;
  userId: string;
  title: string;
  source: BookSource;
  localPath: string;
  fileType: BookFileType;

  currentLine: number;
  totalLines: number;

  createdAt: string; // ISO string
  lastRead?: string; // ISO string
  updatedAt: string; // ISO string

  // setting for TTS per book
  settings?: SpeechOptions & TextOptions;
}

export interface BookContent {
  bookId: string;
  lines: string[];
  langCode: string;
}

export interface BookDto {
  userId: string;
  title: string;
  source: BookSource;
}

export interface UpdateProgressRequest {
  bookId: string;
  currentLine: number;
}

export interface UploadBookResponse {
  book: Book;
}
