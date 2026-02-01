import { Book, BookContent } from '@audiobook/shared';

export class BookRepository {
  private books: Map<string, Book> = new Map();
  private bookContents: Map<string, BookContent> = new Map();

  getAll = (): Book[] => {
    return Array.from(this.books.values());
  };

  getById = (id: string): Book | undefined => {
    return this.books.get(id);
  };

  getByTitle = (title: string): Book | undefined => {
    return Array.from(this.books.values()).find((book) => book.title === title);
  };

  add = (book: Book): void => {
    this.books.set(book.id, book);
  };

  update = (id: string, updates: Partial<Book>): Book | undefined => {
    const found = this.books.get(id);
    if (!found) return undefined;

    const updatedBook = { ...found, ...updates };
    this.books.set(id, updatedBook);
    return updatedBook;
  };

  delete = (id: string): boolean => {
    this.bookContents.delete(id);
    return this.books.delete(id);
  };

  getContent = (id: string): BookContent | undefined => {
    return this.bookContents.get(id);
  };

  setContent = (id: string, content: BookContent): void => {
    this.bookContents.set(id, content);
  };
}
