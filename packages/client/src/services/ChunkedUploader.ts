import type { Book } from '@audiobook/shared';

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  currentChunk: number;
  totalChunks: number;
  speed: number; // bytes per second
  estimatedTimeRemaining: number; // seconds
}

export interface ChunkedUploadConfig {
  chunkSize: number; // bytes
  maxParallel: number; // number of parallel chunk uploads
  maxRetries: number; // retry attempts per chunk
  onProgress?: (progress: UploadProgress) => void;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void;
  onError?: (error: Error) => void;
}

interface ChunkMetadata {
  index: number;
  start: number;
  end: number;
  size: number;
  retries: number;
}

export const UPLOAD_CHUNK_SIZE = 1 * 1024 * 1024; // 1MB

export class ChunkedUploader {
  private file: File;
  private config: Required<ChunkedUploadConfig>;
  private uploadedChunks: Set<number> = new Set();
  private uploadId: string | null = null;
  private abortController: AbortController | null = null;
  private startTime: number = 0;
  private uploadedBytes: number = 0;
  private totalChunks: number = 0;

  constructor(file: File, config: Partial<ChunkedUploadConfig> = {}) {
    this.file = file;
    this.config = {
      chunkSize: UPLOAD_CHUNK_SIZE,
      maxParallel: 3,
      maxRetries: 3,
      onProgress: () => {},
      onChunkComplete: () => {},
      onError: () => {},
      ...config,
    };
    this.totalChunks = Math.ceil(file.size / this.config.chunkSize);
  }

  /**
   * Start the upload process
   */
  upload = async (): Promise<Book> => {
    this.abortController = new AbortController();
    this.startTime = Date.now();
    this.uploadedBytes = 0;

    try {
      // Step 1: Initialize upload session
      this.uploadId = await this.initializeUpload();

      // Step 2: Upload all chunks
      await this.uploadAllChunks();

      // Step 3: Finalize upload and create book
      return this.finalizeUpload();
    } catch (error) {
      this.config.onError(error as Error);
      throw error;
    }
  };

  /**
   * Cancel the ongoing upload
   */
  cancel = (): void => {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  };

  /**
   * Resume a previously started upload
   */
  resume = async (uploadId: string): Promise<Book> => {
    this.uploadId = uploadId;
    this.abortController = new AbortController();

    try {
      // Get upload status from server
      const status = await this.getUploadStatus(uploadId);

      // Mark already uploaded chunks
      status.uploadedChunks.forEach((idx: number) => {
        this.uploadedChunks.add(idx);
        this.uploadedBytes += this.getChunkSize(idx);
      });

      // Resume uploading remaining chunks
      await this.uploadAllChunks();

      // Finalize
      return await this.finalizeUpload();
    } catch (error) {
      this.config.onError(error as Error);
      throw error;
    }
  };

  /**
   * Initialize upload session on server
   */
  private initializeUpload = async (): Promise<string> => {
    const response = await fetch('/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: this.file.name,
        fileSize: this.file.size,
        fileType: this.file.type,
        totalChunks: this.totalChunks,
      }),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const json = await response.json();
      throw new Error(json.message || 'Failed to initialize upload');
    }

    const { uploadId } = await response.json();
    return uploadId;
  };

  /**
   * Upload all chunks (with parallel processing)
   */
  private uploadAllChunks = async (): Promise<void> => {
    const chunks = this.createChunkMetadata();
    const chunksToUpload = chunks.filter((chunk) => !this.uploadedChunks.has(chunk.index));

    // Upload in batches (parallel)
    for (let i = 0; i < chunksToUpload.length; i += this.config.maxParallel) {
      const batch = chunksToUpload.slice(i, i + this.config.maxParallel);

      await Promise.all(batch.map((chunk) => this.uploadChunkWithRetry(chunk)));
    }
  };

  /**
   * Upload a single chunk with retry logic
   */
  private uploadChunkWithRetry = async (chunk: ChunkMetadata): Promise<void> => {
    while (chunk.retries <= this.config.maxRetries) {
      try {
        await this.uploadChunk(chunk);
        return;
      } catch (error) {
        chunk.retries++;

        if (chunk.retries > this.config.maxRetries) {
          throw new Error((error as Error).message || `Failed to upload chunk ${chunk.index} after ${this.config.maxRetries} retries`);
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, chunk.retries - 1), 10000);
        await this.sleep(delay);
      }
    }
  };

  /**
   * Upload a single chunk
   */
  private uploadChunk = async (chunk: ChunkMetadata): Promise<void> => {
    const blob = this.file.slice(chunk.start, chunk.end);
    const formData = new FormData();

    formData.append('uploadId', this.uploadId!);
    formData.append('chunkIndex', chunk.index.toString());
    formData.append('totalChunks', this.totalChunks.toString());
    formData.append('chunk', blob);

    const response = await fetch('/api/upload/chunk', {
      method: 'POST',
      body: formData,
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const json = await response.json();
      throw new Error(json.message || 'Chunk upload failed');
    }

    // Mark chunk as uploaded
    this.uploadedChunks.add(chunk.index);
    this.uploadedBytes += chunk.size;

    // Notify progress
    this.notifyProgress();
    this.config.onChunkComplete(chunk.index, this.totalChunks);
  };

  /**
   * Finalize upload and create book record
   */
  private finalizeUpload = async (): Promise<Book> => {
    const response = await fetch('/api/upload/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: this.uploadId,
      }),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const json = await response.json();
      throw new Error(json.message);
    }

    const result = await response.json();
    return result;
  };

  /**
   * Get upload status from server (for resume)
   */
  private getUploadStatus = async (uploadId: string): Promise<{ uploadedChunks: number[] }> => {
    const response = await fetch(`/api/upload/status/${uploadId}`);

    if (!response.ok) {
      const json = await response.json();
      throw new Error(json.message);
    }

    return response.json();
  };

  /**
   * Create chunk metadata for all chunks
   */
  private createChunkMetadata = (): ChunkMetadata[] => {
    const chunks: ChunkMetadata[] = [];

    for (let i = 0; i < this.totalChunks; i++) {
      const start = i * this.config.chunkSize;
      const end = Math.min(start + this.config.chunkSize, this.file.size);

      chunks.push({
        index: i,
        start,
        end,
        size: end - start,
        retries: 0,
      });
    }

    return chunks;
  };

  /**
   * Get the size of a specific chunk
   */
  private getChunkSize = (chunkIndex: number): number => {
    const start = chunkIndex * this.config.chunkSize;
    const end = Math.min(start + this.config.chunkSize, this.file.size);
    return end - start;
  };

  /**
   * Calculate and notify upload progress
   */
  private notifyProgress = (): void => {
    const elapsedTime = (Date.now() - this.startTime) / 1000; // seconds
    const speed = elapsedTime > 0 ? this.uploadedBytes / elapsedTime : 0;
    const remainingBytes = this.file.size - this.uploadedBytes;
    const estimatedTimeRemaining = speed > 0 ? remainingBytes / speed : 0;

    const progress: UploadProgress = {
      uploadedBytes: this.uploadedBytes,
      totalBytes: this.file.size,
      percentage: (this.uploadedBytes / this.file.size) * 100,
      currentChunk: this.uploadedChunks.size,
      totalChunks: this.totalChunks,
      speed,
      estimatedTimeRemaining,
    };

    this.config.onProgress(progress);
  };

  /**
   * Helper: sleep function for retry delays
   */
  private sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  /**
   * Format bytes to human readable
   */
  static formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  /**
   * Format time to human readable
   */
  static formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  };
}
