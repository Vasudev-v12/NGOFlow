import express from 'express';
import { patchProfile, changePassword } from '../controllers/profileController.js';

const router = express.Router();

router.patch('/', patchProfile);

router.post('/change-password', changePassword);

export default router;