import { AudiobookService } from '@/services/AudiobookService';
import { BookService } from '@/services/bookService';
import { fixEncoding, PAGE_SIZE } from '@audiobook/shared';
import { Request, Response } from 'express';
import path from 'path';

export class BookController {
  constructor(
    private bookService: BookService,
    private audiobookService: AudiobookService,
  ) {}

  /**
   * Legacy upload (simple, for small files < 1MB)
   */
  upload = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const fileType = req.file.originalname.split('.').pop()?.toLowerCase();
      if (!fileType) {
        return res.status(400).json({ message: 'Invalid file type' });
      }

      const bookTitle = req.body.title || path.basename(req.file.originalname, path.extname(req.file.originalname));
      const cleanTitle = fixEncoding(bookTitle);

      this.bookService.checkExisting(cleanTitle, req.file.path);
      const book = await this.bookService.upload(req.file.path, fileType, cleanTitle);

      res.status(201).json(book);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error adding book';
      return res.status(400).json({ message });
    }
  };

  getAll = (_req: Request, res: Response) => {
    const books = this.bookService.getAll();
    res.json(books);
  };

  getById = (req: Request, res: Response) => {
    const book = this.bookService.getById(req.params.id as string);
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }
    res.json(book);
  };

  getAudioForLine = async (req: Request, res: Response) => {
    const { id, lineIndex } = req.params;

    try {
      const buffer = await this.audiobookService.getAudioForLine(id as string, parseInt(lineIndex as string));

      // Set headers for MP3 audio
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length,
        'Accept-Ranges': 'bytes',
      });

      res.send(buffer);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate audio' });
    }
  };

  getContent = (req: Request, res: Response) => {
    const { id } = req.params;
    // Parse pagination params from query (e.g., ?offset=0&limit=50)
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || PAGE_SIZE;

    try {
      const content = this.bookService.getContent(id as string, offset, limit);
      res.json(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error retrieving book content';
      return res.status(404).json({ message });
    }
  };

  search = (req: Request, res: Response) => {
    const { id } = req.params;
    const query = req.query.q as string;

    if (!query) {
      return res.status(400).json({ message: 'No query provided' });
    }

    try {
      const matches = this.bookService.search(id as string, query);

      res.json({ count: matches.length, indices: matches });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Error text search for "${query}"`;
      return res.status(500).json({ message });
    }
  };

  update = (req: Request, res: Response) => {
    try {
      const updatedBook = this.bookService.update(req.params.id as string, {
        ...req.body,
        lastRead: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      res.json(updatedBook);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error updating book';
      return res.status(400).json({ message });
    }
  };

  delete = (req: Request, res: Response) => {
    try {
      this.bookService.delete(req.params.id as string);
      res.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error deleting book';
      return res.status(400).json({ message });
    }
  };
}
