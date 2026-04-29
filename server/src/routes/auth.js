import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { authenticateRequest, createToken, publicUser } from '../auth.js';

const router = Router();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

router.post('/signup', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 40);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!name || !email || password.length < 6) {
      res.status(400).json({ error: 'Name, valid email, and a 6+ character password are required.' });
      return;
    }

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      res.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    const token = createToken(user);

    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
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
