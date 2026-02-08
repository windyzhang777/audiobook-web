import { UploadController } from '@/controllers/uploadController';
import { Router } from 'express';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

export const uploadRoutes = (uploadController: UploadController) => {
  const router = Router();

  router.post('/init', uploadController.initializeUpload);

  // Upload single chunk
  router.post('/chunk', upload.single('chunk'), uploadController.uploadChunk);

  // Finalize upload (merge chunks and create book)
  router.post('/finalize', uploadController.finalizeUpload);

  // Get upload status (for resume)
  router.get('/status/:uploadId', uploadController.getUploadStatus);

  // Cancel upload
  router.post('/cancel/:uploadId', uploadController.cancelUpload);

  return router;
};
