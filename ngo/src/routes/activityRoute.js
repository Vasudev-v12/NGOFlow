import express from 'express';
import { listActivities } from '../controllers/activityController.js';

const router = express.Router();
router.get('/', listActivities);
export default router;
