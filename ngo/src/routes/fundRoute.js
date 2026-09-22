import express from 'express';
import { createUtilization, listFunds } from '../controllers/fundController.js';

const router = express.Router();
router.get('/', listFunds);
router.post('/utilizations', createUtilization);
export default router;
