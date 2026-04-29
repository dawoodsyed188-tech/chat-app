import { Router } from 'express';
import { getRecentMessages } from '../messageStore.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const context = req.query.context === 'direct' ? 'direct' : 'room';
    const messages = await getRecentMessages({
      context,
      roomId: String(req.query.roomId || 'general'),
      userId: req.user.id,
      recipientId: String(req.query.recipientId || '')
    });
    res.json(messages);
  } catch (error) {
    next(error);
  }
});

export default router;
