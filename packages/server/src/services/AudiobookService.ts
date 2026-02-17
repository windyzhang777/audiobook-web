import { uploadsDir } from '@/index';
import { BookRepository } from '@/repositories/book';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { TTSGoogle } from './TTSService';

export class AudiobookService {
  private uploadsDir = uploadsDir;

  constructor(
    private bookRepository: BookRepository,
    private ttsService: TTSGoogle,
  ) {}

  /**
   * Generates audio for a specific line of a book.
   * Best for "On-Demand" streaming to save on Google Cloud costs.
   */
  async getAudioForLine(bookId: string, lineIndex: number): Promise<Buffer> {
    const content = this.bookRepository.getContent(bookId);
    if (!content || !content.lines[lineIndex]) {
      throw new Error('Line not found');
    }

    const text = content.lines[lineIndex];
    // Use the lang stored during upload
    const audioBuffer = await this.ttsService.synthesize(text, content.lang);

    return audioBuffer as Buffer;
  }

  /**
   * Pre-generates the entire audiobook (Long running task)
   */
  async processFullAudiobook(bookId: string) {
    const content = this.bookRepository.getContent(bookId);
    if (!content) throw new Error('Book content not found');

    const audioFileName = `${bookId}.mp3`;
    const audioPath = path.join(this.uploadsDir, audioFileName);
    const writeStream = createWriteStream(audioPath);

    try {
      for (const [index, line] of content.lines.entries()) {
        const buffer = await this.ttsService.synthesize(line, content.lang);

        await new Promise<void>((resolve, reject) => {
          const proceed = writeStream.write(buffer);
          if (proceed) resolve();
          else writeStream.once('drain', resolve); // Handle backpressure
          writeStream.once('error', reject);
        });

        // Small yield to keep event loop responsive, but no heavy artificial delay
        if (index % 10 === 0) await new Promise(setImmediate);
      }

      await new Promise((resolve) => writeStream.end(resolve));
      this.bookRepository.update(bookId, { audioPath });
    } catch (error) {
      writeStream.destroy();
      try {
        await fs.unlink(audioPath); // Cleanup the partial/broken file
      } catch (error) {
        console.error(`Failed to delete audio at ${audioPath}:`, error);
      }

      throw new Error(`Synthesis failed: ${(error as Error).message}`);
    }
  }
}
