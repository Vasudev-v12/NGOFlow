import express from 'express';
import { listNgos, updateNgoStatus } from '../controllers/ngoController.js';

const router = express.Router();
router.get('/', listNgos);
router.patch('/:ngoId/status', updateNgoStatus);

export default router;
