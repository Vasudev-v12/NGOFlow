import mongoose from 'mongoose';
import { Campaign, FundEntry, Ngo, UTILIZATION_CATEGORIES } from '../models/models.js';
import { ROLES, getCurrentUserFromHeader, httpError, recordActivity, requireRole, resolveTenantNgo } from '../methods.js';

// Net balance (funds received minus utilized) for an NGO, optionally narrowed to one campaign.
async function fundBalance(ngoId, campaignId = undefined) {
  const match = { ngoId: new mongoose.Types.ObjectId(String(ngoId)) };
  if (campaignId !== undefined) match.campaignId = new mongoose.Types.ObjectId(String(campaignId));
  const totals = await FundEntry.aggregate([{ $match: match }, { $group: { _id: '$type', amount: { $sum: '$amount' } } }]);
  const sum = type => totals.find(item => item._id === type)?.amount || 0;
  return sum('fund') - sum('utilization');
}

const parseProofUrl = value => {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch { /* fall through */ }
  throw httpError(422, 'Proof link must be a valid http(s) URL');
};

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
    if (!ngoId || !mongoose.isValidObjectId(ngoId) || !await Ngo.exists({ _id: ngoId })) throw httpError(422, 'A valid NGO is required');
    const campaignId = req.body.campaignId || req.body.campaign_id || null;
    if (campaignId && (!mongoose.isValidObjectId(campaignId) || !await Campaign.exists({ _id: campaignId, ngoId }))) throw httpError(403, 'Campaign does not belong to this NGO');

    const category = String(req.body.category || 'other');
    if (!UTILIZATION_CATEGORIES[category]) throw httpError(422, 'Invalid utilization category');
    const description = String(req.body.description || '').trim();
    if (!description) throw httpError(422, 'Describe what the funds were used for');
    const utilizedOnRaw = req.body.utilizedOn || req.body.utilized_on;
    const utilizedOn = utilizedOnRaw ? new Date(utilizedOnRaw) : new Date();
    if (Number.isNaN(utilizedOn.getTime()) || utilizedOn > new Date()) throw httpError(422, 'Utilization date must be a valid date that is not in the future');
    const beneficiariesReached = Number(req.body.beneficiariesReached ?? req.body.beneficiaries_reached ?? 0);
    if (!Number.isInteger(beneficiariesReached) || beneficiariesReached < 0) throw httpError(422, 'Beneficiaries reached must be a whole number');
    const proofUrl = parseProofUrl(req.body.proofUrl ?? req.body.proof_url);

    // Donors see utilization as a share of what they gave, so spending can never exceed what was received.
    const ngoBalance = await fundBalance(ngoId);
    if (amount > ngoBalance) throw httpError(422, `Utilization exceeds the NGO's available balance of ₹${ngoBalance.toLocaleString('en-IN')}`);
    if (campaignId) {
      const campaignBalance = await fundBalance(ngoId, campaignId);
      if (amount > campaignBalance) throw httpError(422, `Utilization exceeds this campaign's available balance of ₹${campaignBalance.toLocaleString('en-IN')}`);
    }

    const entry = await FundEntry.create({ ngoId, campaignId, type: 'utilization', amount, description, category, utilizedOn, beneficiariesReached, proofUrl, recordedBy: current._id });
    if (campaignId && beneficiariesReached > 0) {
      // Keep the campaign's served count in step with the people reached, capped at its target (when one is set).
      await Campaign.updateOne({ _id: campaignId }, [{
        $set: {
          beneficiariesServed: {
            $let: {
              vars: { total: { $add: [{ $ifNull: ['$beneficiariesServed', 0] }, beneficiariesReached] } },
              in: { $cond: [{ $gt: ['$beneficiaryTarget', 0] }, { $min: ['$$total', '$beneficiaryTarget'] }, '$$total'] }
            }
          }
        }
      }], { updatePipeline: true });
    }
    await recordActivity({ ngoId, actorId: current._id, action: 'fund.utilization_recorded', entityType: 'fund_entry', entityId: entry._id, details: { amount, campaignId, category } });
    res.status(201).json({ ...entry.toObject(), id: entry._id.toString() });
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Fund utilization could not be recorded' }); }
};

export { listFunds, createUtilization };
