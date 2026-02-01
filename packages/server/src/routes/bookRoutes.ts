import { BookController } from '@/controllers/bookController';
import { BookRepository } from '@/repositories/book';
import { BookService } from '@/services/bookService';
import { TextProcessorService } from '@/services/textProcessorService';
import { isValidFileType, sanitizeFileName } from '@audiobook/shared';
import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Ensure uploads directory exists
export const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Multer upload configuration
 * Saves files to the 'uploads' directory with a unique filename
 * and filters by allowed book file types.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const fileExt = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, fileExt);
    cb(null, `${uuidv4()}-${sanitizeFileName(baseName)}${fileExt.toLowerCase()}`);
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
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
});

export const bookRoutes = () => {
  const bookRepository = new BookRepository();
  const textProcessorService = new TextProcessorService();
  const bookService = new BookService(bookRepository, textProcessorService);
  const bookController = new BookController(bookService);

  const router = Router();

  router.get('/', bookController.getAll);
  router.get('/:id', bookController.getById);
  router.put('/:id', bookController.update);
  router.get('/:id/content', bookController.getContent);
  router.post('/upload', upload.single('file'), bookController.upload);
  router.delete('/:id', bookController.delete);

  return router;
};
