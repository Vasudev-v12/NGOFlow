import express from "express";
import { fetchCampaigns, createCampaign, updateCampaign, deleteCampaign } from "../controllers/campaignController.js";

const router = express.Router();

router.get('/', fetchCampaigns);

router.post('/', createCampaign);
router.patch('/:campaignId', updateCampaign);
router.delete('/:campaignId', deleteCampaign);

export default router;
