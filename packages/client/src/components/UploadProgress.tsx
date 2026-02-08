import { AlertCircle, CheckCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { ChunkedUploader, type UploadProgress } from '../services/ChunkedUploader';

interface UploadProgressProps {
  file: File;
  onComplete?: (bookId: string) => void;
  onCancel?: () => void;
}

type UploadStatus = 'uploading' | 'completed' | 'error' | 'cancelled';

export function UploadProgressDialog({ file, onComplete, onCancel }: UploadProgressProps) {
  const [status, setStatus] = useState<UploadStatus>('uploading');
  const [progress, setProgress] = useState<UploadProgress>({
    uploadedBytes: 0,
    totalBytes: file.size,
    percentage: 0,
    currentChunk: 0,
    totalChunks: 0,
    speed: 0,
    estimatedTimeRemaining: 0,
  });
  const [error, setError] = useState<string>('');
  const uploaderRef = useRef<ChunkedUploader | null>(null);
  const uploadStarted = useRef(false);

  // Start upload on mount
  useEffect(() => {
    const startUpload = async () => {
      if (uploadStarted.current) return;
      uploadStarted.current = true;

      try {
        const book = await api.upload.smartUpload(file, {
          onProgress: (p) => setProgress(p),
          onError: (err) => {
            setStatus('error');
            setError(err.message);
          },
        });

        setStatus('completed');
        setTimeout(() => {
          onComplete?.(book.id);
        }, 1500);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    };

    startUpload();
  }, []);

  const handleCancel = () => {
    if (uploaderRef.current) {
      uploaderRef.current.cancel();
    }
    setStatus('cancelled');
    onCancel?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {status === 'uploading' && 'Uploading...'}
            {status === 'completed' && 'Upload Complete!'}
            {status === 'error' && 'Upload Failed'}
            {status === 'cancelled' && 'Upload Cancelled'}
          </h3>
          {status === 'uploading' && (
            <button onClick={handleCancel} className="text-gray-500 hover:text-gray-700">
              <X size={20} />
            </button>
          )}
        </div>

        {/* File Info */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 truncate">{file.name}</p>
          <p className="text-xs text-gray-500">{ChunkedUploader.formatBytes(file.size)}</p>
        </div>

        {/* Progress Bar */}
        {status === 'uploading' && (
          <div className="space-y-3">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress.percentage}%` }} />
            </div>

            <div className="flex justify-between text-sm text-gray-600">
              <span>{Math.round(progress.percentage)}%</span>
              <span>
                {ChunkedUploader.formatBytes(progress.uploadedBytes)} / {ChunkedUploader.formatBytes(progress.totalBytes)}
              </span>
            </div>

            <div className="flex justify-between text-xs text-gray-500">
              <span>
                Chunk {progress.currentChunk} / {progress.totalChunks}
              </span>
              <span>{ChunkedUploader.formatBytes(progress.speed)}/s</span>
            </div>

            {progress.estimatedTimeRemaining > 0 && <div className="text-xs text-gray-500 text-center">Estimated time remaining: {ChunkedUploader.formatTime(progress.estimatedTimeRemaining)}</div>}
          </div>
        )}

        {/* Success State */}
        {status === 'completed' && (
          <div className="flex flex-col items-center py-4">
            <CheckCircle className="text-green-500 mb-3" size={48} />
            <p className="text-gray-700">Book uploaded successfully!</p>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button onClick={onCancel} className="float-right bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300">
              Close
            </button>
          </div>
        )}

        {/* Cancel Button */}
        {status === 'uploading' && (
          <button onClick={handleCancel} className="float-right mt-4 bg-red-100 text-red-700 py-2 rounded-lg hover:bg-red-200">
            Cancel Upload
          </button>
        )}
      </div>
    </div>
  );
}

// Compact version for inline use
export function UploadProgressCompact({ progress }: { progress: UploadProgress }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">{Math.round(progress.percentage)}%</span>
        <span className="text-gray-500 text-xs">{ChunkedUploader.formatBytes(progress.speed)}/s</span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${progress.percentage}%` }} />
      </div>

      <div className="flex justify-between text-xs text-gray-500">
        <span>
          {ChunkedUploader.formatBytes(progress.uploadedBytes)} / {ChunkedUploader.formatBytes(progress.totalBytes)}
        </span>
        {progress.estimatedTimeRemaining > 0 && <span>{ChunkedUploader.formatTime(progress.estimatedTimeRemaining)} left</span>}
      </div>
    </div>
  );
}
