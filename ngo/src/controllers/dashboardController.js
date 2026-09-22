import { ActivityLog, Campaign, Donation, FundEntry, Ngo, User } from '../models/models.js';
import { ROLES, getCurrentUserFromHeader, publicUser, requireRole, resolveTenantNgo } from '../methods.js';
import { serializeCampaign } from './campaignController.js';

const serialize = item => ({ ...item, id: item._id.toString() });

async function buildDashboard(user) {
  const superAdmin = user.role === ROLES.SUPER_ADMIN;
  const ngoId = superAdmin ? null : await resolveTenantNgo(user);
  const tenant = superAdmin ? {} : { ngoId };
  const campaignScope = user.role === ROLES.STAFF ? { ...tenant, createdBy: user._id } : tenant;
  const campaigns = await Campaign.find(campaignScope).sort({ createdAt: -1 }).lean();
  const campaignIds = campaigns.map(item => item._id);
  const donationScope = user.role === ROLES.STAFF ? { campaignId: { $in: campaignIds } } : tenant;
  const [donations, funds, ngo, activities, ngos] = await Promise.all([
    Donation.find(donationScope).sort({ createdAt: -1 }).lean(),
    FundEntry.find(user.role === ROLES.STAFF ? { campaignId: { $in: campaignIds } } : tenant).sort({ createdAt: -1 }).lean(),
    superAdmin ? Promise.resolve(null) : Ngo.findById(ngoId).lean(),
    user.role === ROLES.STAFF ? Promise.resolve([]) : ActivityLog.find(tenant).sort({ createdAt: -1 }).limit(100).lean(),
    superAdmin ? Ngo.find().sort({ createdAt: -1 }).lean() : Promise.resolve([]),
  ]);
  const users = superAdmin
    ? await User.find().sort({ createdAt: -1 }).lean()
    : await User.find({ ngoId }).sort({ createdAt: -1 }).lean();
  const donorIds = [...new Set(donations.map(item => item.donorId.toString()))];
  const donors = superAdmin
    ? users.filter(item => item.role === ROLES.DONOR)
    : await User.find({ _id: { $in: donorIds }, role: ROLES.DONOR }).sort({ name: 1 }).lean();
  return {
    user: publicUser(user), ngo: ngo || null, users: users.map(publicUser),
    campaigns: campaigns.map(serializeCampaign), donations: donations.map(serialize), funds: funds.map(serialize),
    activities: activities.map(serialize), ngos: ngos.map(serialize), donors: donors.map(publicUser),
    total_users: users.length, staff_count: users.filter(item => item.role === ROLES.STAFF).length,
    donor_count: donors.length,
    inactive_count: users.filter(item => item.status === 'inactive' || item.status === 'suspended').length,
    pending_users: users.filter(item => item.status === 'pending'),
    total_raised: donations.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    beneficiary_target: campaigns.reduce((sum, item) => sum + Number(item.beneficiaryTarget || 0), 0),
    beneficiaries_served: campaigns.reduce((sum, item) => sum + Number(item.beneficiariesServed || 0), 0),
    total_campaigns: campaigns.length,
  };
}

const superAdmin = async (req, res) => {
  try { const user = await getCurrentUserFromHeader(req.headers.authorization); requireRole(user, [ROLES.SUPER_ADMIN]); res.json(await buildDashboard(user)); }
  catch (error) { res.status(error.status || 500).json({ detail: error.message }); }
};
const ngoAdmin = async (req, res) => {
  try { const user = await getCurrentUserFromHeader(req.headers.authorization); requireRole(user, [ROLES.NGO_ADMIN]); res.json(await buildDashboard(user)); }
  catch (error) { res.status(error.status || 500).json({ detail: error.message }); }
};
const staff = async (req, res) => {
  try { const user = await getCurrentUserFromHeader(req.headers.authorization); requireRole(user, [ROLES.STAFF]); res.json(await buildDashboard(user)); }
  catch (error) { res.status(error.status || 500).json({ detail: error.message }); }
};
const donor = async (req, res) => {
  try {
    const user = await getCurrentUserFromHeader(req.headers.authorization); requireRole(user, [ROLES.DONOR]);
    const [donations, campaigns] = await Promise.all([Donation.find({ donorId: user._id }).sort({ createdAt: -1 }).lean(), Campaign.find({ status: 'active' }).sort({ createdAt: -1 }).lean()]);
    res.json({ user: publicUser(user), campaigns: campaigns.map(serializeCampaign), donations: donations.map(serialize), giving_history: donations.map(item => ({ date: item.createdAt, program: item.message, amount: item.amount })), total_given: donations.reduce((sum, item) => sum + item.amount, 0) });
  } catch (error) { res.status(error.status || 500).json({ detail: error.message }); }
};

export { superAdmin, ngoAdmin, staff, donor };
