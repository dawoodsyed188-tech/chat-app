import { Router } from 'express';
import { getRooms } from '../roomStore.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await getRooms());
  } catch (error) {
    next(error);
  }
});

export default router;
