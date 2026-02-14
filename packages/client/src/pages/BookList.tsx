import { UploadProgressDialog } from '@/components/UploadProgress';
import { api } from '@/services/api';
import { calculateProgress, type Book } from '@audiobook/shared';
import { BookOpen, Loader, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const BookList = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFile, setUploadingFile] = useState<{ file: File } | null>(null);
  const [isEdit, setIsEdit] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState<Book['id'][]>([]);
  const canDelete = isEdit && selectedBooks.length > 0;

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
    closeEdit();

    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile({ file });
    e.target.value = '';
  };

  const handleDelete = async () => {
    if (!confirm('Delete selected books?')) return;

    setLoading(true);
    try {
      await Promise.all(selectedBooks.map((bookId) => api.books.delete(bookId)));
      await loadBooks();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete selected books');
      setLoading(false);
    } finally {
      closeEdit();
    }
  };

  const handleEditBooks = () => {
    setSelectedBooks([]);
    setIsEdit((prev) => !prev);
  };

  const closeEdit = () => {
    setSelectedBooks([]);
    if (isEdit) setIsEdit(false);
  };

  useEffect(() => {
    loadBooks();
  }, [uploadingFile]);

  if (loading) {
    return (
      <div aria-label="loading" className="min-h-full flex justify-center items-center gap-2">
        <Loader />
      </div>
    );
  }

  return (
    <div className="min-h-full max-w-2xl mx-auto py-8">
      <header className="text-center mb-4">
        <h3 className="font-semibold">My Books</h3>
      </header>

      {/* Upload */}
      <label className="flex justify-center items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 active:bg-blue-800">
        <Upload size={16} />
        <span>Upload a new book (txt, pdf, epub, mobi)</span>
        <input aria-label="upload" type="file" accept=".txt,.pdf,.epub,.mobi" tabIndex={0} disabled={loading} onChange={handleUpload} onClick={() => closeEdit()} className="hidden" />
      </label>

      {/* Edit Panel */}
      <div className="relative my-4 flex justify-end items-center text-xs text-gray-400">
        <button
          aria-label="Delete"
          disabled={!canDelete}
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === ' ' || e.key === 'Enter') {
              handleDelete();
            }
          }}
          className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${canDelete ? 'shake-active bg-red-100 text-red-600' : 'text-red-800! opacity-50 cursor-not-allowed'}`}
          style={{ visibility: isEdit ? 'visible' : 'hidden' }}
        >
          <Trash2 size={16} />
        </button>
        <button aria-label={isEdit ? 'Done' : 'Edit'} onClick={handleEditBooks}>
          {isEdit ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* Books */}
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
                key={`book-${book.id}`}
                aria-label={`Book ${book.id}`}
                onClick={() => {
                  if (isEdit) {
                    setSelectedBooks((prev) => {
                      if (prev.includes(book.id)) {
                        return prev.filter((id) => id !== book.id);
                      } else {
                        return [...prev, book.id];
                      }
                    });
                  } else {
                    closeEdit();
                    navigate(`/book/${book.id}`);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (isEdit) {
                      setSelectedBooks((prev) => {
                        if (prev.includes(book.id)) {
                          return prev.filter((id) => id !== book.id);
                        } else {
                          return [...prev, book.id];
                        }
                      });
                    } else {
                      navigate(`/book/${book.id}`);
                    }
                  }
                }}
                className="flex flex-col justify-center items-center gap-4 bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer p-4"
                style={{ backgroundColor: selectedBooks.includes(book.id) ? 'lightgray' : '' }}
              >
                <h3 className="font-medium truncate">{book.title}</h3>
                {book.lastRead ? (
                  <div className="text-xs">Progress: {progress}%</div>
                ) : (
                  <div className="bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent text-xs font-extrabold">
                    START READING!
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Upload Progress Dialog */}
      {uploadingFile && <UploadProgressDialog file={uploadingFile.file} onComplete={() => setUploadingFile(null)} onCancel={() => setUploadingFile(null)} />}
      <style>
        {`
          @keyframes shaking {
            0% { transform: rotate(0deg); }
            25% { transform: rotate(-3deg); }
            50% { transform: rotate(0deg); }
            75% { transform: rotate(3deg); }
            100% { transform: rotate(0deg); }
          }
          .shake-active {
            animation: shaking 0.2s ease-in-out infinite;
          }
        `}
      </style>
    </div>
  );
};
