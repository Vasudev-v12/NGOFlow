import express from "express";
import { user, userStatus } from "../controllers/userController.js";

const router = express.Router();

router.get('/', user);

router.patch('/:userId/status', userStatus);

export default router;
