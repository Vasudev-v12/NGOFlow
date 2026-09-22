import express from 'express';
import { deleteUser, listDonors, listUsers, updateUserStatus } from '../controllers/userController.js';

const router = express.Router();
router.get('/', listUsers);
router.get('/donors', listDonors);
router.patch('/:userId/status', updateUserStatus);
router.delete('/:userId', deleteUser);
export default router;
