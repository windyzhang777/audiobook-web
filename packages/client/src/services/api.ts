import { ChunkedUploader, UPLOAD_CHUNK_SIZE, type ChunkedUploadConfig } from '@/services/ChunkedUploader';
import { type Book, type BookContent } from '@audiobook/shared';

export const api = {
  books: {
    /**
     * Legacy upload (simple, for small files < 1MB)
     */
    upload: async (file: File): Promise<Book> => {
      const formData = new FormData();
      formData.append('file', file);

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

    getContent: async (id: string, offset: number, limit: number): Promise<BookContent> => {
      const response = await fetch(`/api/books/${id}/content?offset=${offset}&limit=${limit}`);

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.message);
      }
      return response.json();
    },

    update: async (id: string, updates: Partial<Book>): Promise<Book> => {
      try {
        const response = await fetch(`/api/books/${id}`, {
          method: 'PATCH',
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
      } catch {
        throw new Error('api to update book failed');
      }
    },

    delete: async (id: string) => {
      await fetch(`/api/books/${id}`, {
        method: 'DELETE',
      });
    },
  },

  upload: {
    /**
     * Upload book with chunked upload (recommended for files > 1MB)
     */
    uploadChunked: async (file: File, config?: Partial<ChunkedUploadConfig>): Promise<Book> => {
      const uploader = new ChunkedUploader(file, config);
      return uploader.upload();
    },

    /**
     * Smart upload - automatically chooses chunked or simple based on file size
     */
    smartUpload: async (file: File, config?: Partial<ChunkedUploadConfig>): Promise<Book> => {
      const threshold = UPLOAD_CHUNK_SIZE;

      if (file.size > threshold) {
        return api.upload.uploadChunked(file, config);
      } else {
        return api.books.upload(file);
      }
    },
  },
};
