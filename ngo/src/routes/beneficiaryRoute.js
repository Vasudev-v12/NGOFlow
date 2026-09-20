import express from 'express';
import { listBeneficiaries, createBeneficiary } from '../controllers/beneficiaryController.js';

const router = express.Router();

router.get('/', listBeneficiaries);
router.post('/', createBeneficiary);

export default router;
