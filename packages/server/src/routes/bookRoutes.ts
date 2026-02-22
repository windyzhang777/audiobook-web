import { BookController } from '@/controllers/bookController';
import { uploadsDir } from '@/index';
import { isValidFileType } from '@audiobook/shared';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Multer upload configuration
 * Saves files to the 'uploads' directory with a unique filename
 * and filters by allowed book file types.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const fileExt = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, fileExt);
    cb(null, `${uuidv4()}-${baseName}${fileExt.toLowerCase()}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: (error: Error | null, acceptFile?: boolean) => void) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (isValidFileType(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'));
  }
};

export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_SIZE },
});

export const bookRoutes = (bookController: BookController) => {
  const router = Router();

  router.get('/', bookController.getAll);
  router.get('/:id', bookController.getById);
  router.get('/:id/audio/:lineIndex', bookController.getAudioForLine);
  router.patch('/:id', bookController.update);
  router.get('/:id/content', bookController.getContent);
  router.post('/upload', upload.single('file'), bookController.upload);
  router.get('/:id/search', bookController.search);
  router.delete('/:id', bookController.delete);

  return router;
};
