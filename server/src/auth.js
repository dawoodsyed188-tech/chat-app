import jwt from 'jsonwebtoken';
import User from './models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret';
const JWT_EXPIRES_IN = '7d';

export function createToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      name: user.name,
      profileImageUrl: user.profileImageUrl
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    profileImageUrl: user.profileImageUrl || ''
  };
}

export async function verifyToken(token) {
  if (!token) {
    throw new Error('Missing token');
  }

  const payload = jwt.verify(token, JWT_SECRET);
  const user = await User.findById(payload.sub).lean();

  if (!user) {
    throw new Error('User not found');
  }

  return publicUser(user);
}

export async function authenticateRequest(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    req.user = await verifyToken(token);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication required.' });
  }
}
