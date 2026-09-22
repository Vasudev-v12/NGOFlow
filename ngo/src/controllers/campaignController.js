import { Campaign, Donation, FundEntry, Ngo } from '../models/models.js';
import { ROLES, getCurrentUserFromHeader, httpError, recordActivity, requireRole, resolveTenantNgo } from '../methods.js';

const serializeCampaign = campaign => {
  const data = campaign?.toObject ? campaign.toObject() : { ...campaign };
  return { ...data, id: data.id || data._id?.toString(), ngo_name: data.ngoName || '', goal_amount: data.goalAmount || 0, raised_amount: data.raisedAmount || 0, days_left: data.daysLeft || 0, beneficiary_target: data.beneficiaryTarget || 0, beneficiaries_served: data.beneficiariesServed || 0, created_at: data.createdAt || null };
};

const numberFrom = (payload, camelName, snakeName, fallback = undefined) => {
  const value = payload[camelName] ?? payload[snakeName] ?? fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw httpError(422, `${camelName} must be a valid number`);
  return number;
};

const validateCampaignNumbers = payload => {
  const goalAmount = numberFrom(payload, 'goalAmount', 'goal_amount');
  const daysLeft = numberFrom(payload, 'daysLeft', 'days_left', 30);
  const beneficiaryTarget = numberFrom(payload, 'beneficiaryTarget', 'beneficiary_target', 0);
  const beneficiariesServed = numberFrom(payload, 'beneficiariesServed', 'beneficiaries_served', 0);
  if (goalAmount <= 0 || daysLeft < 0 || beneficiaryTarget < 0 || beneficiariesServed < 0) {
    throw httpError(422, 'Campaign amounts and counts cannot be negative');
  }
  if (beneficiariesServed > beneficiaryTarget && beneficiaryTarget > 0) {
    throw httpError(422, 'Beneficiaries served cannot exceed the campaign target');
  }
  return { goalAmount, daysLeft, beneficiaryTarget, beneficiariesServed };
};

const fetchCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find({ status: 'active' }).sort({ createdAt: -1 }).lean();
    res.json(campaigns.map(serializeCampaign));
  } catch { res.status(500).json({ detail: 'Campaign data is unavailable' }); }
};

const createCampaign = async (req, res) => {
  try {
    const user = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(user, [ROLES.STAFF]);
    const ngoId = await resolveTenantNgo(user);
    const ngo = await Ngo.findById(ngoId).lean();
    if (!ngo || ngo.status !== 'active') throw httpError(403, 'Your NGO is not active');
    const payload = req.body || {};
    if (!payload.title || !payload.summary || !payload.category || !payload.location) throw httpError(422, 'Campaign details are incomplete');
    const numbers = validateCampaignNumbers(payload);
    const campaign = await Campaign.create({
      ngoId, ngoName: ngo.name, title: String(payload.title).trim(), summary: String(payload.summary).trim(),
      category: String(payload.category).trim(), location: String(payload.location).trim(), ...numbers,
      createdBy: user._id, status: 'active',
    });
    await recordActivity({ ngoId, actorId: user._id, action: 'campaign.created', entityType: 'campaign', entityId: campaign._id, details: { title: campaign.title } });
    res.status(201).json(serializeCampaign(campaign));
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Campaign could not be created' }); }
};

const updateCampaign = async (req, res) => {
  try {
    const user = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(user, [ROLES.STAFF]);
    const ngoId = await resolveTenantNgo(user);
    const campaign = await Campaign.findOne({ _id: req.params.campaignId, ngoId, createdBy: user._id });
    if (!campaign) throw httpError(404, 'Campaign not found or not owned by you');
    const allowed = ['title', 'summary', 'category', 'location', 'status'];
    for (const key of allowed) if (req.body[key] !== undefined) campaign[key] = req.body[key];
    if (req.body.status !== undefined && !['draft', 'active', 'completed'].includes(req.body.status)) throw httpError(422, 'Invalid campaign status');
    const next = {
      goalAmount: req.body.goalAmount ?? req.body.goal_amount ?? campaign.goalAmount,
      daysLeft: req.body.daysLeft ?? req.body.days_left ?? campaign.daysLeft,
      beneficiaryTarget: req.body.beneficiaryTarget ?? req.body.beneficiary_target ?? campaign.beneficiaryTarget,
      beneficiariesServed: req.body.beneficiariesServed ?? req.body.beneficiaries_served ?? campaign.beneficiariesServed,
    };
    const numbers = validateCampaignNumbers(next);
    Object.assign(campaign, numbers);
    await campaign.save();
    await recordActivity({ ngoId, actorId: user._id, action: 'campaign.updated', entityType: 'campaign', entityId: campaign._id, details: { title: campaign.title } });
    res.json(serializeCampaign(campaign));
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Campaign could not be updated' }); }
};

const deleteCampaign = async (req, res) => {
  try {
    const user = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(user, [ROLES.STAFF]);
    const ngoId = await resolveTenantNgo(user);
    const campaign = await Campaign.findOne({ _id: req.params.campaignId, ngoId, createdBy: user._id });
    if (!campaign) throw httpError(404, 'Campaign not found or not owned by you');
    if (await Donation.exists({ campaignId: campaign._id })) throw httpError(409, 'A campaign with contributions cannot be deleted');
    if (await FundEntry.exists({ campaignId: campaign._id })) throw httpError(409, 'A campaign with fund records cannot be deleted');
    await recordActivity({ ngoId, actorId: user._id, action: 'campaign.deleted', entityType: 'campaign', entityId: campaign._id, details: { title: campaign.title } });
    await campaign.deleteOne();
    res.status(204).end();
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Campaign could not be deleted' }); }
};

export { fetchCampaigns, createCampaign, updateCampaign, deleteCampaign, serializeCampaign };
