import { Campaign, Donation, FundEntry, Ngo } from '../models/models.js';
import { ROLES, getCurrentUserFromHeader, httpError, recordActivity, requireRole, resolveTenantNgo } from '../methods.js';

const listDonations = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    let query;
    if (current.role === ROLES.DONOR) query = { donorId: current._id };
    else if (current.role === ROLES.SUPER_ADMIN) query = {};
    else if (current.role === ROLES.NGO_ADMIN) query = { ngoId: await resolveTenantNgo(current) };
    else {
      const campaigns = await Campaign.find({ ngoId: await resolveTenantNgo(current), createdBy: current._id }).select('_id').lean();
      query = { campaignId: { $in: campaigns.map(item => item._id) } };
    }
    const donations = await Donation.find(query).sort({ createdAt: -1 }).lean();
    res.json(donations.map(item => ({ ...item, id: item._id.toString() })));
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Donation data is unavailable' }); }
};

const createDonation = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.DONOR]);
    const campaign = await Campaign.findOne({ _id: req.body.campaignId || req.body.campaign_id, status: 'active' });
    if (!campaign) throw httpError(404, 'Campaign not found');
    if (!await Ngo.exists({ _id: campaign.ngoId, status: 'active' })) throw httpError(403, 'This campaign’s NGO is not active');
    const amount = Number(req.body.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw httpError(422, 'Donation amount must be greater than zero');
    const isNewSupporter = !await Donation.exists({ donorId: current._id, campaignId: campaign._id, status: 'success' });
    const donation = await Donation.create({ donorId: current._id, donorName: current.name, campaignId: campaign._id, ngoId: campaign.ngoId, amount, message: String(req.body.message || 'Support for campaign').trim(), status: 'success' });
    await FundEntry.create({ ngoId: campaign.ngoId, campaignId: campaign._id, type: 'fund', amount, description: 'Donation received', recordedBy: current._id });
    campaign.raisedAmount += amount;
    if (isNewSupporter) campaign.supporters += 1;
    await campaign.save();
    await recordActivity({ ngoId: campaign.ngoId, actorId: current._id, action: 'donation.created', entityType: 'donation', entityId: donation._id, details: { campaignId: campaign._id, amount } });
    res.status(201).json({ ...donation.toObject(), id: donation._id.toString() });
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Donation could not be recorded' }); }
};

export { listDonations, createDonation };
