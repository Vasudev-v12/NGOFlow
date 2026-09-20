import express from "express";
import { fetchCampaigns, createCampaign } from "../controllers/campaignController.js";

const router = express.Router();

router.get('/', fetchCampaigns);

router.post('/', createCampaign);

export default router;