import { BookService } from '@/services/bookService';
import { fixEncoding } from '@audiobook/shared';
import { Request, Response } from 'express';
import path from 'path';

export class BookController {
  constructor(private bookService: BookService) {}

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

  getContent = (req: Request, res: Response) => {
    try {
      const content = this.bookService.getContent(req.params.id as string);
      res.json(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error retrieving book content';
      return res.status(404).json({ message });
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
