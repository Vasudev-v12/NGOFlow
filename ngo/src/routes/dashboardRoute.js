import express from "express";
import { superAdmin, ngoAdmin, staff, donor } from "../controllers/dashboardController.js";

const router = express.Router();

router.get('/super_admin', superAdmin);
router.get('/ngo_admin', ngoAdmin);
router.get('/admin', ngoAdmin);
router.get('/campaigns', ngoAdmin);

router.get('/staff', staff);

router.get('/donor', donor);

export default router;
