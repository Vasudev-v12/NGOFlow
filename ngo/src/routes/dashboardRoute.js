import express from "express";
import { admin, staff, donor } from "../controllers/dashboardController.js";

const router = express.Router();

router.get('/admin', admin);
router.get('/campaigns', admin);

router.get('/staff', staff);

router.get('/donor', donor);

export default router;