import express from 'express';
import multer from 'multer';
import path from 'node:path';

const router = express.Router();
const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads');
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `image-${uniqueSuffix}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (allowedMimes.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/', (req, res) => {
  upload.single('image')(req, res, (error) => {
    if (error) {
      const message =
        error.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5MB or smaller.' : 'Only JPEG, PNG, GIF, and WebP images are allowed.';
      return res.status(400).json({ error: message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded.' });
    }

    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({ url });
  });
});

export default router;
