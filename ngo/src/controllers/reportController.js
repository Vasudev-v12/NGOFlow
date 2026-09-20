import { Donation, Campaign, User, Beneficiary } from '../models/models.js';
import { getCurrentUserFromHeader } from '../methods.js';

const fetchReports = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    if (!['admin', 'staff'].includes(current.role)) {
      return res.status(403).json({ detail: 'Administrative access is required' });
    }

    const donations = await Donation.find().sort({ createdAt: -1 }).lean();
    const campaigns = await Campaign.find().sort({ createdAt: -1 }).lean();
    const beneficiaries = await Beneficiary.find().sort({ createdAt: -1 }).lean();
    const donors = await User.find({ role: 'donor' }).lean();

    const report = {
      totalRaised: donations.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      totalCampaigns: campaigns.length,
      totalBeneficiaries: beneficiaries.length,
      totalDonors: donors.length,
      donationTrend: donations.slice(0, 7).map((item) => ({
        date: item.createdAt,
        amount: Number(item.amount || 0),
      })),
      recentCampaigns: campaigns.slice(0, 5).map((item) => ({
        title: item.title,
        raised: Number(item.raisedAmount || 0),
        goal: Number(item.goalAmount || 0),
      })),
    };

    res.json(report);
  } catch (error) {
    res.status(error.status || 500).json({ detail: error.message || 'Report data is unavailable' });
  }
};

export { fetchReports };
