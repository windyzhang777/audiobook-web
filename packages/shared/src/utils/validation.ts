import { BookFileType } from '@/types';

// Convert franc langCode 3-letter (ISO 639-3) to 2-letter (BCP 47) + region
export const localeByLang: Record<string, string> = {
  cmn: 'zh-CN', // Mandarin -> Chinese (Simplified)
  eng: 'en-US', // English -> English (US)
  fra: 'fr-FR', // French -> French (France)
  und: 'en-US', // Undetermined -> Default
};

// \p{L} matches any letter from any language
// \p{N} matches any kind of numeric character
export const hasAlphanumeric = /[\p{L}\p{N}]/u;

export const fixEncoding = (str: string): string => Buffer.from(str, 'latin1').toString('utf8');

export const isValidFileType = (fileType: string): boolean => {
  const validTypes: BookFileType[] = ['txt', 'epub', 'pdf', 'mobi'];
  return validTypes.some((type) => `.${type}`.includes(fileType.toLowerCase()));
};

export const sanitizeFileName = (fileName: string): string =>
  fileName
    .replace(/[^a-z0-9_\-\.]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

export const calculateProgress = (currentLine: number, totalLines: number): number => {
  if (totalLines === 0) return 0;
  return Math.round((currentLine / totalLines) * 100);
};

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

export const formatTime = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};
