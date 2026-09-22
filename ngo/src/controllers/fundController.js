import { Campaign, FundEntry, Ngo } from '../models/models.js';
import { ROLES, getCurrentUserFromHeader, httpError, recordActivity, requireRole, resolveTenantNgo } from '../methods.js';

const listFunds = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN, ROLES.NGO_ADMIN, ROLES.STAFF]);
    let query = {};
    if (current.role === ROLES.NGO_ADMIN) query = { ngoId: await resolveTenantNgo(current) };
    if (current.role === ROLES.STAFF) {
      const campaigns = await Campaign.find({ ngoId: await resolveTenantNgo(current), createdBy: current._id }).select('_id').lean();
      query = { campaignId: { $in: campaigns.map(item => item._id) } };
    }
    const funds = await FundEntry.find(query).sort({ createdAt: -1 }).lean();
    res.json(funds.map(item => ({ ...item, id: item._id.toString() })));
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Fund data is unavailable' }); }
};

const createUtilization = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN, ROLES.NGO_ADMIN]);
    const amount = Number(req.body.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw httpError(422, 'Utilization amount must be greater than zero');
    const ngoId = current.role === ROLES.SUPER_ADMIN ? req.body.ngoId || req.body.ngo_id : await resolveTenantNgo(current);
    if (!ngoId || !await Ngo.exists({ _id: ngoId })) throw httpError(422, 'A valid NGO is required');
    const campaignId = req.body.campaignId || req.body.campaign_id || null;
    if (campaignId && !await Campaign.exists({ _id: campaignId, ngoId })) throw httpError(403, 'Campaign does not belong to this NGO');
    const entry = await FundEntry.create({ ngoId, campaignId, type: 'utilization', amount, description: String(req.body.description || '').trim(), recordedBy: current._id });
    await recordActivity({ ngoId, actorId: current._id, action: 'fund.utilization_recorded', entityType: 'fund_entry', entityId: entry._id, details: { amount, campaignId } });
    res.status(201).json({ ...entry.toObject(), id: entry._id.toString() });
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Fund utilization could not be recorded' }); }
};

export { listFunds, createUtilization };
