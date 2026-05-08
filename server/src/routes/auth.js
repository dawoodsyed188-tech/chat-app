import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import User from '../models/User.js';
import { authenticateRequest, createToken, publicUser } from '../auth.js';
import { isDatabaseConnected } from '../db.js';
import { imageUpload } from './upload.js';

const router = Router();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function handleUploadError(error, res) {
  if (!error) {
    return false;
  }

  const message =
    error.code === 'LIMIT_FILE_SIZE' ? 'Profile image must be 5MB or smaller.' : 'Only JPEG, PNG, GIF, and WebP images are allowed.';
  res.status(400).json({ error: message });
  return true;
}

async function removeUploadedFile(file) {
  if (!file?.path) {
    return;
  }

  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Could not remove upload ${file.path}:`, error.message);
    }
  }
}

router.post('/signup', (req, res, next) => {
  imageUpload.single('profileImage')(req, res, async (uploadError) => {
    if (handleUploadError(uploadError, res)) {
      return;
    }

    try {
      if (!isDatabaseConnected()) {
        await removeUploadedFile(req.file);
        res.status(503).json({ error: 'Database is not available. Please try again later.' });
        return;
      }

      const name = String(req.body?.name || '').trim().slice(0, 40);
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password || '');
      const profileImageUrl = req.file ? `/uploads/${req.file.filename}` : '';

      if (!name || !email || password.length < 6) {
        await removeUploadedFile(req.file);
        res.status(400).json({ error: 'Name, valid email, and a 6+ character password are required.' });
        return;
      }

      const existing = await User.findOne({ email }).lean();
      if (existing) {
        await removeUploadedFile(req.file);
        res.status(409).json({ error: 'An account with that email already exists.' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({ name, email, passwordHash, profileImageUrl });
      const token = createToken(user);

      res.status(201).json({ token, user: publicUser(user) });
    } catch (error) {
      await removeUploadedFile(req.file);
      next(error);
    }
  });
});

router.post('/login', async (req, res, next) => {
  try {
    if (!isDatabaseConnected()) {
      res.status(503).json({ error: 'Database is not available. Please try again later.' });
      return;
    }

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticateRequest, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
