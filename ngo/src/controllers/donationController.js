import { Donation, Campaign, Ngo } from '../models/models.js';
import { getCurrentUserFromHeader } from '../methods.js';

const listDonations = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    const ngo = current.ngoId ? await Ngo.findById(current.ngoId) : await Ngo.findOne({ adminId: current._id });

    const query = current.role === 'donor' ? { donorId: current._id } : { ngoId: ngo?._id || current.ngoId };
    const donations = await Donation.find(query).sort({ createdAt: -1 }).lean();

    res.json(donations.map((item) => ({ ...item, id: item._id.toString() })));
  } catch (error) {
    res.status(error.status || 500).json({ detail: error.message || 'Donation data is unavailable' });
  }
};

const createDonation = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    if (current.role !== 'donor') {
      return res.status(403).json({ detail: 'Donor access is required' });
    }

    const payload = req.body || {};
    const campaign = await Campaign.findById(payload.campaignId || payload.campaign_id);
    if (!campaign) {
      return res.status(404).json({ detail: 'Campaign not found' });
    }

    const amount = Number(payload.amount || 0);
    if (!amount || amount <= 0) {
      return res.status(400).json({ detail: 'Donation amount must be greater than zero' });
    }

    const donation = await Donation.create({
      donorId: current._id,
      donorName: current.name,
      campaignId: campaign._id,
      ngoId: campaign.ngoId || null,
      amount,
      message: String(payload.message || 'Support for campaign').trim(),
      status: 'success',
    });

    campaign.raisedAmount = Number(campaign.raisedAmount || 0) + amount;
    campaign.supporters = Number(campaign.supporters || 0) + 1;
    await campaign.save();

    res.status(201).json({ ...donation.toObject(), id: donation._id.toString() });
  } catch (error) {
    res.status(error.status || 500).json({ detail: error.message || 'Donation could not be recorded' });
  }
};

export { listDonations, createDonation };
