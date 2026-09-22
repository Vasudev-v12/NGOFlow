import { Campaign, Donation, User } from '../models/models.js';
import { ROLES, getCurrentUserFromHeader, requireRole, resolveTenantNgo } from '../methods.js';

const fetchReports = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN, ROLES.NGO_ADMIN, ROLES.STAFF]);
    const tenant = current.role === ROLES.SUPER_ADMIN ? {} : { ngoId: await resolveTenantNgo(current) };
    const campaignScope = current.role === ROLES.STAFF ? { ...tenant, createdBy: current._id } : tenant;
    const campaigns = await Campaign.find(campaignScope).sort({ createdAt: -1 }).lean();
    const donations = await Donation.find(current.role === ROLES.STAFF ? { campaignId: { $in: campaigns.map(item => item._id) } } : tenant).sort({ createdAt: -1 }).lean();
    const donorCount = new Set(donations.map(item => item.donorId.toString())).size;
    res.json({ totalRaised: donations.reduce((sum, item) => sum + Number(item.amount || 0), 0), totalCampaigns: campaigns.length, beneficiaryTarget: campaigns.reduce((sum, item) => sum + Number(item.beneficiaryTarget || 0), 0), beneficiariesServed: campaigns.reduce((sum, item) => sum + Number(item.beneficiariesServed || 0), 0), totalDonors: current.role === ROLES.SUPER_ADMIN ? await User.countDocuments({ role: ROLES.DONOR }) : donorCount, donationTrend: donations.slice(0, 7).map(item => ({ date: item.createdAt, amount: item.amount })), recentCampaigns: campaigns.slice(0, 5).map(item => ({ title: item.title, raised: item.raisedAmount, goal: item.goalAmount })) });
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Report data is unavailable' }); }
};

export { fetchReports };
