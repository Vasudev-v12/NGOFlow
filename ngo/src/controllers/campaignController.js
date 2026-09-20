import { getCurrentUserFromHeader } from '../methods.js';
import { Campaign, Ngo } from '../models/models.js';

const serializeCampaign = (campaign) => {
  const data = campaign && typeof campaign.toObject === 'function' ? campaign.toObject() : { ...campaign };
  return {
    ...data,
    id: data.id || data._id?.toString(),
    ngo_name: data.ngoName || data.ngo_name || '',
    goal_amount: data.goalAmount ?? data.goal_amount ?? 0,
    raised_amount: data.raisedAmount ?? data.raised_amount ?? 0,
    days_left: data.daysLeft ?? data.days_left ?? 0,
    created_at: data.createdAt || data.created_at || null,
  };
};

const createCampaign = async (req, res) => {
  try {
    const user = await getCurrentUserFromHeader(req.headers.authorization);

    if (user.role !== 'staff' && user.role !== 'admin') {
      return res.status(403).json({ detail: 'NGO staff access is required' });
    }

    const payload = req.body || {};
    const ngoName = String(payload.ngo_name || payload.ngoName || 'NGOFlow Foundation').trim();
    const ngo = user.ngoId ? await Ngo.findById(user.ngoId) : await Ngo.findOne({ adminId: user._id });

    const campaign = await Campaign.create({
      ngoId: ngo?._id || null,
      ngoName,
      title: String(payload.title || '').trim(),
      summary: String(payload.summary || '').trim(),
      category: String(payload.category || '').trim(),
      location: String(payload.location || '').trim(),
      goalAmount: Number(payload.goal_amount || payload.goalAmount || 0),
      raisedAmount: 0,
      supporters: 0,
      daysLeft: Number(payload.days_left || payload.daysLeft || 30),
      createdBy: user._id,
      status: 'active',
    });

    const response = serializeCampaign(campaign);
    res.status(201).json(response);
  } catch (e) {
    res.status(e.status || 500).json({ detail: e.message || 'Campaign data is unavailable' });
  }
};

const fetchCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 }).lean();
    res.json(campaigns.map(serializeCampaign));
  } catch (e) {
    res.status(500).json({ detail: 'Campaign data is unavailable' });
  }
};

export { createCampaign, fetchCampaigns };