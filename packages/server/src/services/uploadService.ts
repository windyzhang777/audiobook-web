import { uploadsDir } from '@/index';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface UploadSession {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  totalChunks: number;
  uploadedChunks: Set<number>;
  tempDir: string;
  createdAt: Date;
  lastActivity: Date;
}

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

export class UploadService {
  private sessions = new Map<string, UploadSession>();
  private cleanupInterval: NodeJS.Timeout;
  private uploadsDir = uploadsDir;

  constructor() {
    // Ensure temp directory exists
    this.ensureDirectories();

    // Start cleanup job (runs every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleUploads();
    }, ONE_HOUR);
  }

  /**
   * Initialize a new upload session
   */
  initializeUpload = async (fileName: string, fileSize: number, fileType: string, totalChunks: number): Promise<string> => {
    const uploadId = uuidv4();
    const tempDir = path.join(this.uploadsDir, uploadId);

    // Create temp directory for this upload
    await fs.mkdir(tempDir, { recursive: true });

    const session: UploadSession = {
      id: uploadId,
      fileName,
      fileSize,
      fileType,
      totalChunks,
      uploadedChunks: new Set(),
      tempDir,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(uploadId, session);

    console.log(`Upload session initialized: ${uploadId} (${fileName}, ${totalChunks} chunks)`);

    return uploadId;
  };

  /**
   * Save a chunk to disk
   */
  saveChunk = async (uploadId: string, chunkIndex: number, chunkData: Buffer): Promise<void> => {
    const session = this.sessions.get(uploadId);

    if (!session) {
      throw new Error('Upload session not found');
    }

    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw new Error(`Invalid chunk index: ${chunkIndex}`);
    }

    // Save chunk to temp directory
    const chunkPath = path.join(session.tempDir, `chunk-${String(chunkIndex).padStart(5, '0')}`);
    await fs.writeFile(chunkPath, chunkData);

    // Mark chunk as uploaded
    session.uploadedChunks.add(chunkIndex);
    session.lastActivity = new Date();

    console.log(`Chunk ${chunkIndex + 1}/${session.totalChunks} saved for upload ${uploadId} ` + `(${session.uploadedChunks.size}/${session.totalChunks} complete)`);
  };

  /**
   * Merge all chunks and finalize the upload
   */
  finalizeUpload = async (uploadId: string, outputDir = uploadsDir): Promise<Record<string, string>> => {
    const session = this.sessions.get(uploadId);

    if (!session) {
      throw new Error('Upload session not found');
    }

    // Verify all chunks are uploaded
    if (session.uploadedChunks.size !== session.totalChunks) {
      const missing = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.uploadedChunks.has(i)) {
          missing.push(i);
        }
      }
      throw new Error(`Missing chunks: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`);
    }

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const fileName = session.fileName;
    const filePath = path.join(outputDir, `${uuidv4()}-${fileName}`);

    console.log(`Merging ${session.totalChunks} chunks for ${uploadId}...`);

    // Merge chunks
    await this.mergeChunks(session, filePath);

    // Cleanup
    await this.cleanupSession(uploadId);

    console.log(`Upload finalized: ${uploadId} -> ${filePath}`);

    return { filePath, fileName };
  };

  /**
   * Merge all chunks into a single file
   */
  private mergeChunks = async (session: UploadSession, outputPath: string): Promise<void> => {
    const writeStream = createWriteStream(outputPath);

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(session.tempDir, `chunk-${String(i).padStart(5, '0')}`);

      try {
        const chunkData = await fs.readFile(chunkPath);
        writeStream.write(chunkData);
      } catch (error) {
        writeStream.close();
        throw new Error(`Failed to read chunk ${i}: ${(error as Error).message}`);
      }
    }

    // Wait for write to complete
    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });
  };

  /**
   * Get upload session status
   */
  getStatus = (uploadId: string): { uploadedChunks: number[]; totalChunks: number; progress: number; fileName: string } | null => {
    const session = this.sessions.get(uploadId);

    if (!session) {
      return null;
    }

    return {
      uploadedChunks: Array.from(session.uploadedChunks),
      totalChunks: session.totalChunks,
      progress: (session.uploadedChunks.size / session.totalChunks) * 100,
      fileName: session.fileName,
    };
  };

  /**
   * Cancel an upload session
   */
  cancelUpload = async (uploadId: string): Promise<void> => {
    const session = this.sessions.get(uploadId);

    if (session) {
      await this.cleanupSession(uploadId);
      console.log(`Upload cancelled: ${uploadId}`);
    }
  };

  /**
   * Clean up a specific upload session
   */
  private cleanupSession = async (uploadId: string): Promise<void> => {
    const session = this.sessions.get(uploadId);

    if (!session) return;

    // Delete temp directory
    try {
      await fs.rm(session.tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to delete temp directory for ${uploadId}:`, error);
    }

    // Remove from sessions
    this.sessions.delete(uploadId);
  };

  /**
   * Clean up stale uploads (older than 1 day)
   */
  private cleanupStaleUploads = async (): Promise<void> => {
    const now = Date.now();
    const staleThreshold = ONE_DAY; // 1 day

    for (const [uploadId, session] of this.sessions.entries()) {
      const age = now - session.lastActivity.getTime();

      if (age > staleThreshold) {
        console.log(`Cleaning up stale upload: ${uploadId} (${Math.round(age / ONE_HOUR)}h old)`);
        await this.cleanupSession(uploadId);
      }
    }
  };

  /**
   * Ensure required directories exist
   */
  private ensureDirectories = async (): Promise<void> => {
    await fs.mkdir(this.uploadsDir, { recursive: true });
  };

  /**
   * Cleanup on shutdown
   */
  destroy = (): void => {
    clearInterval(this.cleanupInterval);
  };
}
