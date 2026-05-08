import { Router } from 'express';
import fs from 'node:fs/promises';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { publicUser } from '../auth.js';
import { isDatabaseConnected } from '../db.js';
import { imageUpload } from './upload.js';

const router = Router();

function uploadErrorMessage(error) {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return 'Profile image must be 5MB or smaller.';
  }

  return 'Only JPEG, PNG, GIF, and WebP images are allowed.';
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

router.post('/upload', (req, res, next) => {
  imageUpload.single('profileImage')(req, res, async (uploadError) => {
    if (uploadError) {
      res.status(400).json({ error: uploadErrorMessage(uploadError) });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No profile image uploaded.' });
      return;
    }

    try {
      const profileImageUrl = `/uploads/${req.file.filename}`;
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { profileImageUrl },
        {
          new: true,
          runValidators: true
        }
      );

      if (!user) {
        await removeUploadedFile(req.file);
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      res.status(201).json({
        url: profileImageUrl,
        user: publicUser(user)
      });
    } catch (error) {
      await removeUploadedFile(req.file);
      next(error);
    }
  });
});

router.patch('/', (req, res, next) => {
  imageUpload.single('profileImage')(req, res, async (uploadError) => {
    if (uploadError) {
      res.status(400).json({ error: uploadErrorMessage(uploadError) });
      return;
    }

    try {
      if (!isDatabaseConnected()) {
        await removeUploadedFile(req.file);
        res.status(503).json({ error: 'Database is not available. Please try again later.' });
        return;
      }

      const name = String(req.body?.name || '').trim().slice(0, 40);

      if (!name) {
        await removeUploadedFile(req.file);
        res.status(400).json({ error: 'Display name is required.' });
        return;
      }

      const updates = { name };
      if (req.file) {
        updates.profileImageUrl = `/uploads/${req.file.filename}`;
      }

      const user = await User.findByIdAndUpdate(req.user.id, updates, {
        new: true,
        runValidators: true
      });

      if (!user) {
        await removeUploadedFile(req.file);
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      await Message.updateMany(
        { userId: req.user.id },
        {
          username: user.name,
          profileImageUrl: user.profileImageUrl || ''
        }
      );

      res.json({ user: publicUser(user) });
    } catch (error) {
      await removeUploadedFile(req.file);
      next(error);
    }
  });
});

export default router;
