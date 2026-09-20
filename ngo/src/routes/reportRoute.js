import express from 'express';
import { fetchReports } from '../controllers/reportController.js';

const router = express.Router();

router.get('/', fetchReports);

export default router;
