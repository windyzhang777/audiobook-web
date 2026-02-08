import { BookService } from '@/services/bookService';
import { UploadService } from '@/services/uploadService';
import { getFileTitle } from '@audiobook/shared';
import { Request, Response } from 'express';

export class UploadController {
  constructor(
    private uploadService: UploadService,
    private bookService: BookService,
  ) {}

  /**
   * Initialize a chunked upload session
   */
  initializeUpload = async (req: Request, res: Response) => {
    try {
      const { fileName, fileSize, fileType, totalChunks } = req.body;

      // Validate request
      if (!fileName || !fileSize || !totalChunks) {
        return res.status(400).json({ message: 'Missing required fields: fileName, fileSize, totalChunks' });
      }

      const { title } = getFileTitle(fileName);
      this.bookService.checkExisting(title);

      // Initialize upload session
      const uploadId = await this.uploadService.initializeUpload(fileName, fileSize, fileType || 'application/octet-stream', totalChunks);

      res.status(200).json({ uploadId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize upload';
      res.status(500).json({ message });
    }
  };

  /**
   * Handle chunk upload
   */
  uploadChunk = async (req: Request, res: Response) => {
    try {
      const { uploadId, chunkIndex } = req.body;
      const chunk = req.file;

      // Validate request
      if (!uploadId || chunkIndex === undefined || !chunk) {
        return res.status(400).json({ message: 'Missing required fields: uploadId, chunkIndex, chunk' });
      }

      // Save chunk
      await this.uploadService.saveChunk(uploadId, parseInt(chunkIndex, 10), chunk.buffer);

      res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload chunk';
      res.status(500).json({ message });
    }
  };

  /**
   * Finalize upload and create book
   */
  finalizeUpload = async (req: Request, res: Response) => {
    try {
      const { uploadId } = req.body;

      // Validate request
      if (!uploadId) {
        return res.status(400).json({ message: 'Missing uploadId' });
      }

      // Merge chunks and get final file path
      const { filePath, fileName } = await this.uploadService.finalizeUpload(uploadId);

      const { fileType, title } = getFileTitle(fileName);

      // Create book using BookService
      const book = await this.bookService.upload(filePath, fileType, title);

      res.status(200).json(book);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to finalize upload';
      res.status(500).json({ message });
    }
  };

  /**
   * Get upload status (for resume)
   */
  getUploadStatus = async (req: Request, res: Response) => {
    try {
      const status = this.uploadService.getStatus(req.params.uploadId as string);

      if (!status) {
        return res.status(404).json({ message: 'Upload session not found' });
      }

      res.status(200).json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get upload status';
      res.status(500).json({ message });
    }
  };

  /**
   * Cancel an upload
   */
  cancelUpload = async (req: Request, res: Response) => {
    try {
      await this.uploadService.cancelUpload(req.params.uploadId as string);

      res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel upload';
      res.status(500).json({ message });
    }
  };
}
