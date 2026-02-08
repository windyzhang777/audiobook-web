import { calculateProgress, type Book } from '@audiobook/shared';
import { BookOpen, Loader, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { UploadProgressDialog } from '../components/UploadProgress';

export const BookList = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFile, setUploadingFile] = useState<{ file: File } | null>(null);
  const [management, setManagement] = useState(false);

  const navigate = useNavigate();

  const loadBooks = async () => {
    try {
      const books = await api.books.getAll();
      setBooks(books);
    } catch (error) {
      console.error('Failed to load books: ', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (management) manageBooks();
    e.preventDefault();

    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile({ file });
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete ${title}?`)) return;

    try {
      await api.books.delete(id);
      await loadBooks();
    } catch (error) {
      alert(error instanceof Error ? error.message : `Failed to delete ${title}`);
    } finally {
      setLoading(false);
    }
  };

  const manageBooks = () => {
    setManagement((prev) => !prev);
  };

  useEffect(() => {
    loadBooks();
  }, [uploadingFile]);

  if (loading) {
    return (
      <div className="min-h-full flex justify-center items-center gap-2">
        <Loader />
      </div>
    );
  }

  return (
    <div className="min-h-full max-w-2xl mx-auto py-8">
      <header className="text-center mb-4">
        <h3 className="font-semibold">My Books</h3>
      </header>

      <label className="flex justify-center items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 active:bg-blue-800">
        <Upload size={16} />
        <span>Upload a new book (txt, pdf, epub, mobi)</span>
        <input type="file" accept=".txt,.pdf,.epub,.mobi" tabIndex={0} disabled={loading} onChange={handleUpload} className="hidden" />
      </label>

      <div className="my-4 flex justify-end items-center text-xs text-gray-400">
        <button onClick={manageBooks} className="p-0!">
          Book Manager
        </button>
      </div>

      <div className="py-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {books.length === 0 ? (
          <div className="text-center text-gray-500 col-span-full">
            <BookOpen className="mx-auto mb-4 opacity-50" />
            <p>No books yet. Upload your first book to get started!</p>
          </div>
        ) : (
          books.map((book) => {
            const progress = calculateProgress(book.currentLine, book.totalLines);
            return (
              <div
                role="button"
                tabIndex={0}
                key={book.id}
                onClick={() => navigate(`/book/${book.id}`)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    navigate(`/book/${book.id}`);
                  }
                }}
                className="flex flex-col justify-center items-center gap-4 bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer p-4"
              >
                <h3 className="font-medium truncate">{book.title}</h3>
                {book.lastRead ? (
                  <div className="text-xs">Progress: {progress}%</div>
                ) : (
                  <div className="bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent text-xs font-extrabold">
                    START READING!
                  </div>
                )}
                {management ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(book.id, book.title);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === ' ' || e.key === 'Enter') {
                        handleDelete(book.id, book.title);
                      }
                    }}
                    className="text-red-800! hover:text-white! hover:bg-red-600! transition"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <></>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Upload Progress Dialog */}
      {uploadingFile && <UploadProgressDialog file={uploadingFile.file} onComplete={() => setUploadingFile(null)} onCancel={() => setUploadingFile(null)} />}
    </div>
  );
};
