import type { Book, BookContent } from '@audiobook/shared';

export const api = {
  books: {
    upload: async (file: File, title?: string): Promise<Book> => {
      const formData = new FormData();
      formData.append('file', file);
      if (title) formData.append('title', title);

      const response = await fetch('/api/books/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.message);
      }

      return response.json();
    },

    getAll: async (): Promise<Book[]> => {
      const response = await fetch('/api/books');

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.message);
      }
      return response.json();
    },

    getById: async (id: string): Promise<Book> => {
      const response = await fetch(`/api/books/${id}`);

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.message);
      }
      return response.json();
    },

    getContent: async (id: string): Promise<BookContent> => {
      const response = await fetch(`/api/books/${id}/content`);

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.message);
      }
      return response.json();
    },

    update: async (id: string, updates: Partial<Book>): Promise<Book> => {
      const response = await fetch(`/api/books/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...updates }),
        keepalive: true,
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.message);
      }
      return response.json();
    },

    delete: async (id: string) => {
      await fetch(`/api/books/${id}`, {
        method: 'DELETE',
      });
    },
  },
};
