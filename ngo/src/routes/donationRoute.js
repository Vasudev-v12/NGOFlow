import express from 'express';
import { listDonations, createDonation } from '../controllers/donationController.js';

const router = express.Router();

router.get('/', listDonations);
router.post('/', createDonation);

export default router;
