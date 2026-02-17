import { localeByLang } from '@audiobook/shared';
import { EPub } from 'epub2';
import { franc } from 'franc';
import fs from 'fs';

export class TextProcessorService {
  private yield = () => new Promise((resolve) => setImmediate(resolve));

  detectLanguage = (text: string): string => {
    const lang = franc(text, { minLength: 100 });
    return localeByLang[lang] || localeByLang.default; // default to English
  };

  splitTextIntoLines = async (text: string, lang: string = localeByLang.default): Promise<string[]> => {
    try {
      const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
      const segments: string[] = [];

      const iterator = segmenter.segment(text);
      for (const { segment } of iterator) {
        if (!segment) continue;

        // Further split by newlines to respect paragraph breaks
        const subLines = segment.split('\n');
        for (const line of subLines) {
          const trimmed = line.trim();
          if (trimmed) segments.push(trimmed);
        }

        if (segments.length % 100 === 0) await this.yield();
      }

      return segments;
    } catch (error) {
      return this.fallbackSplitSentences(text);
    }
  };

  private fallbackSplitSentences = (text: string): string[] => {
    return text
      .split(/(?<=[.!?])\s+/)
      .flatMap((seg) => seg.split('\n'))
      .map((seg) => seg.trim())
      .filter(Boolean);
  };

  processBookText = async (text: string) => {
    const lang = this.detectLanguage(text);
    const lines = await this.splitTextIntoLines(text, lang);
    return { lang, lines };
  };

  extractText = async (filePath: string, fileType: string): Promise<string> => {
    if (fileType === 'txt') {
      return fs.readFileSync(filePath, 'utf-8');
    }

    if (fileType === 'epub') {
      try {
        const epub = await EPub.createAsync(filePath);
        const textContent: string[] = [];

        for (const chapter of epub.flow) {
          const html = await epub.getChapterRawAsync(chapter.id);

          // Strip HTML and clean whitespace
          const rawText = html
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (rawText) textContent.push(rawText);

          await this.yield();
        }

        return textContent.join('\n\n');
      } catch (error) {
        throw new Error('Failed to parse EPUB: ', error || '');
      }
    }

    throw new Error(`File type ${fileType} not yet supported for text extraction.`);
  };
}
