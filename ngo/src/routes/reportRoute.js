import express from 'express';
import { fetchDetailedReport, fetchReports } from '../controllers/reportController.js';

const router = express.Router();

router.get('/', fetchReports);
router.get('/detailed', fetchDetailedReport);

export default router;
