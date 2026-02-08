import { uploadsDir } from '@/index';
import { BookRepository } from '@/repositories/book';
import { Book, BookContent, BookFileType } from '@audiobook/shared';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { TextProcessorService } from './textProcessorService';

export class BookService {
  private uploadsDir = uploadsDir;

  constructor(
    private bookRepository: BookRepository,
    private textProcessorService: TextProcessorService,
  ) {
    // Ensure temp directory exists
    this.ensureDirectories();
  }

  getAll = () => {
    return this.bookRepository.getAll();
  };

  checkExisting = (bookTitle: string, filePath?: string) => {
    const existingBooks = this.bookRepository.getAll();

    const found = existingBooks.find((book) => book.title === bookTitle);
    if (found) {
      if (filePath) this.deleteFile(filePath);
      throw new Error('Book with the same title already exists');
    }
  };

  upload = async (filePath: string, fileType: string, bookTitle: string) => {
    let textContent: string;
    try {
      textContent = await this.textProcessorService.extractText(filePath, fileType);
    } catch (error) {
      this.deleteFile(filePath);
      throw new Error(`Failed to extract text from file: ${error}`);
    }

    const { langCode, lines } = await this.textProcessorService.processBookText(textContent);
    const now = new Date().toISOString();
    const book: Book = {
      id: uuidv4(),
      userId: 'local-user',
      title: bookTitle,
      source: 'local',
      localPath: filePath,
      fileType: fileType as BookFileType,
      currentLine: 0,
      totalLines: lines.length,
      createdAt: now,
      updatedAt: now,
    };

    this.bookRepository.add(book);

    const content: BookContent = {
      bookId: book.id,
      lines,
      langCode,
    };
    this.bookRepository.setContent(book.id, content);

    return book;
  };

  getById = (id: string) => {
    return this.bookRepository.getById(id);
  };

  getByTitle = (title: string) => {
    return this.bookRepository.getByTitle(title);
  };

  update = (id: string, updates: Partial<Book>) => {
    const updated = this.bookRepository.update(id, updates);
    if (!updated) {
      throw new Error(`Book with ID ${id} not found`);
    }
    return updated;
  };

  delete = (id: string) => {
    const found = this.bookRepository.getById(id);
    if (!found) {
      throw new Error(`Book with ID ${id} not found`);
    }

    this.deleteFile(found.localPath);
    return this.bookRepository.delete(id);
  };

  getContent = (id: string) => {
    const content = this.bookRepository.getContent(id);
    if (!content) {
      throw new Error(`Content for book with ID ${id} not found`);
    }
    return content;
  };

  private deleteFile = (filePath: string) => {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error(`Failed to delete file at ${filePath}:`, error);
    }
  };

  private ensureDirectories = () => {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  };
}
