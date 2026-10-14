import mongoose from 'mongoose';
import { ActivityLog, Campaign, Donation, FundEntry, Ngo, User, UTILIZATION_CATEGORIES } from '../models/models.js';
import { ROLES, getCurrentUserFromHeader, httpError, requireRole, resolveTenantNgo } from '../methods.js';

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

// ---- Detailed activity report (NGO admin: own NGO; super admin: platform or one NGO) ----

const DAY = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 500;
const oid = id => new mongoose.Types.ObjectId(String(id));
const round = value => Math.round(Number(value || 0) * 100) / 100;
const ratio = (part, whole) => (whole > 0 ? part / whole : 0);
const idKey = value => (value ? value.toString() : '');

function parseRange(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw httpError(422, 'Choose a valid date range');
  const days = (to - from) / DAY;
  if (days > 3 * 366) throw httpError(422, 'A report can cover at most three years');
  let timezone = 'UTC';
  try {
    if (query.tz) { new Intl.DateTimeFormat('en-US', { timeZone: String(query.tz) }); timezone = String(query.tz); }
  } catch { /* unknown zone: keep UTC */ }
  // Bucket size keeps charts readable: daily up to ~2 months, weekly up to a year, monthly beyond.
  return { from, to, timezone, unit: days <= 62 ? 'day' : days <= 366 ? 'week' : 'month' };
}

// Bucket key as the local calendar date of the bucket start, e.g. "2026-10-13".
const bucketOf = (dateExpr, range) => ({
  $dateToString: { format: '%Y-%m-%d', timezone: range.timezone, date: { $dateTrunc: { date: dateExpr, unit: range.unit, timezone: range.timezone, startOfWeek: 'monday' } } },
});

async function resolveScope(current, query) {
  if (current.role !== ROLES.SUPER_ADMIN) return oid(await resolveTenantNgo(current));
  const ngoId = query.ngoId || query.ngo_id;
  if (!ngoId) return null;
  if (!mongoose.isValidObjectId(ngoId) || !await Ngo.exists({ _id: ngoId })) throw httpError(404, 'NGO not found');
  return oid(ngoId);
}

async function platformInsights(range) {
  const inRange = { $gte: range.from, $lt: range.to };
  const [[users], ngos, staffByNgo, donorsByNgo, ledger, raisedInRange, campaignsByNgo] = await Promise.all([
    User.aggregate([{ $facet: {
      byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }],
      byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
      newSeries: [{ $match: { createdAt: inRange } }, { $group: { _id: { bucket: bucketOf('$createdAt', range), role: '$role' }, count: { $sum: 1 } } }],
      recent: [{ $match: { createdAt: inRange } }, { $sort: { createdAt: -1 } }, { $limit: LIST_LIMIT }, { $project: { name: 1, email: 1, role: 1, status: 1, ngoId: 1, createdAt: 1 } }],
      newCount: [{ $match: { createdAt: inRange } }, { $count: 'count' }],
    } }]),
    Ngo.find().select('name status location email createdAt').sort({ createdAt: -1 }).lean(),
    User.aggregate([{ $match: { role: ROLES.STAFF, ngoId: { $ne: null } } }, { $group: { _id: '$ngoId', count: { $sum: 1 } } }]),
    Donation.aggregate([{ $match: { status: 'success' } }, { $group: { _id: { ngoId: '$ngoId', donorId: '$donorId' } } }, { $group: { _id: '$_id.ngoId', donors: { $sum: 1 } } }]),
    FundEntry.aggregate([{ $group: { _id: { ngoId: '$ngoId', type: '$type' }, amount: { $sum: '$amount' } } }]),
    Donation.aggregate([{ $match: { status: 'success', createdAt: inRange } }, { $group: { _id: '$ngoId', amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Campaign.aggregate([{ $group: { _id: '$ngoId', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } }]),
  ]);
  const byNgo = (rows, field = 'count') => new Map(rows.map(row => [idKey(row._id), row[field]]));
  const staff = byNgo(staffByNgo);
  const donors = byNgo(donorsByNgo, 'donors');
  const recentRaised = new Map(raisedInRange.map(row => [idKey(row._id), row]));
  const campaignCounts = new Map(campaignsByNgo.map(row => [idKey(row._id), row]));
  const funds = new Map();
  for (const row of ledger) {
    const entry = funds.get(idKey(row._id.ngoId)) || { fund: 0, utilization: 0 };
    entry[row._id.type] = row.amount;
    funds.set(idKey(row._id.ngoId), entry);
  }
  const ngoNames = new Map(ngos.map(ngo => [idKey(ngo._id), ngo.name]));
  const count = (rows, key) => rows.find(row => row._id === key)?.count || 0;
  return {
    users: {
      total: users.byRole.reduce((sum, row) => sum + row.count, 0),
      newInRange: users.newCount[0]?.count || 0,
      byRole: Object.fromEntries([ROLES.DONOR, ROLES.STAFF, ROLES.NGO_ADMIN, ROLES.SUPER_ADMIN].map(role => [role, count(users.byRole, role)])),
      byStatus: Object.fromEntries(['active', 'pending', 'inactive', 'suspended'].map(status => [status, count(users.byStatus, status)])),
      newSeries: users.newSeries.map(row => ({ bucket: row._id.bucket, role: row._id.role, count: row.count })),
      recent: users.recent.map(user => ({ id: idKey(user._id), name: user.name, email: user.email, role: user.role, status: user.status, ngoName: ngoNames.get(idKey(user.ngoId)) || '', joinedAt: user.createdAt })),
    },
    ngos: {
      total: ngos.length,
      active: ngos.filter(ngo => ngo.status === 'active').length,
      newInRange: ngos.filter(ngo => ngo.createdAt >= range.from && ngo.createdAt < range.to).length,
      rows: ngos.map(ngo => {
        const id = idKey(ngo._id);
        const book = funds.get(id) || { fund: 0, utilization: 0 };
        return {
          id, name: ngo.name, status: ngo.status, location: ngo.location || '', joinedAt: ngo.createdAt,
          staff: staff.get(id) || 0, donors: donors.get(id) || 0,
          campaigns: campaignCounts.get(id)?.total || 0, activeCampaigns: campaignCounts.get(id)?.active || 0,
          raisedAllTime: round(book.fund), utilizedAllTime: round(book.utilization), utilizationRate: ratio(book.utilization, book.fund),
          raisedInRange: round(recentRaised.get(id)?.amount || 0), donationsInRange: recentRaised.get(id)?.count || 0,
        };
      }).sort((a, b) => b.raisedAllTime - a.raisedAllTime),
    },
  };
}

const fetchDetailedReport = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN, ROLES.NGO_ADMIN]);
    const range = parseRange(req.query);
    const ngoId = await resolveScope(current, req.query);
    const tenant = ngoId ? { ngoId } : {};
    const inRange = { $gte: range.from, $lt: range.to };

    const [[donationStats], [utilizationStats], ledger, campaigns, donations, [activityStats], ngos] = await Promise.all([
      Donation.aggregate([{ $match: { ...tenant, status: 'success', createdAt: inRange } }, { $facet: {
        totals: [{ $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }],
        series: [{ $group: { _id: bucketOf('$createdAt', range), amount: { $sum: '$amount' }, count: { $sum: 1 } } }],
        byDonor: [{ $group: { _id: '$donorId', name: { $last: '$donorName' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }],
        byCampaign: [{ $group: { _id: '$campaignId', amount: { $sum: '$amount' }, count: { $sum: 1 }, donors: { $addToSet: '$donorId' } } }, { $project: { amount: 1, count: 1, donors: { $size: '$donors' } } }],
      } }]),
      FundEntry.aggregate([
        { $match: { ...tenant, type: 'utilization' } },
        { $addFields: { at: { $ifNull: ['$utilizedOn', '$createdAt'] } } },
        { $match: { at: inRange } },
        { $facet: {
          totals: [{ $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 }, beneficiaries: { $sum: { $ifNull: ['$beneficiariesReached', 0] } } } }],
          series: [{ $group: { _id: bucketOf('$at', range), amount: { $sum: '$amount' } } }],
          byCategory: [{ $group: { _id: { $ifNull: ['$category', 'other'] }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }],
          byCampaign: [{ $group: { _id: '$campaignId', amount: { $sum: '$amount' } } }],
          entries: [{ $sort: { at: -1 } }, { $limit: LIST_LIMIT }, { $project: { recordedBy: 0 } }],
        } },
      ]),
      FundEntry.aggregate([{ $match: tenant }, { $group: { _id: { campaignId: '$campaignId', type: '$type' }, amount: { $sum: '$amount' } } }]),
      Campaign.find(tenant).select('title ngoId ngoName status category goalAmount raisedAmount supporters beneficiaryTarget beneficiariesServed createdAt').lean(),
      Donation.find({ ...tenant, status: 'success', createdAt: inRange }).sort({ createdAt: -1 }).limit(LIST_LIMIT).select('donorName campaignId ngoId amount createdAt').lean(),
      ActivityLog.aggregate([{ $match: { ...tenant, createdAt: inRange } }, { $facet: {
        byAction: [{ $group: { _id: '$action', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        total: [{ $count: 'count' }],
        entries: [{ $sort: { createdAt: -1 } }, { $limit: LIST_LIMIT }],
      } }]),
      ngoId ? Ngo.find({ _id: ngoId }).select('name').lean() : Ngo.find().select('name').lean(),
    ]);

    const ngoNames = new Map(ngos.map(ngo => [idKey(ngo._id), ngo.name]));
    const campaignTitles = new Map(campaigns.map(campaign => [idKey(campaign._id), campaign.title]));
    const actorIds = [...new Set(activityStats.entries.map(entry => idKey(entry.actorId)))];
    const actors = new Map((await User.find({ _id: { $in: actorIds } }).select('name role').lean()).map(user => [idKey(user._id), user]));

    // All-time ledger per campaign, plus the scope's overall balance.
    const allTime = new Map();
    let fundTotal = 0, utilizedTotal = 0;
    for (const row of ledger) {
      if (row._id.type === 'fund') fundTotal += row.amount; else utilizedTotal += row.amount;
      if (!row._id.campaignId) continue;
      const entry = allTime.get(idKey(row._id.campaignId)) || { fund: 0, utilization: 0 };
      entry[row._id.type] = row.amount;
      allTime.set(idKey(row._id.campaignId), entry);
    }
    const raisedByCampaign = new Map(donationStats.byCampaign.map(row => [idKey(row._id), row]));
    const utilizedByCampaign = new Map(utilizationStats.byCampaign.map(row => [idKey(row._id), row.amount]));

    const donationTotals = donationStats.totals[0] || { amount: 0, count: 0 };
    const utilizationTotals = utilizationStats.totals[0] || { amount: 0, count: 0, beneficiaries: 0 };
    const report = {
      generatedAt: new Date(),
      range: { from: range.from, to: range.to, unit: range.unit, timezone: range.timezone },
      scope: ngoId ? { type: 'ngo', ngoId: idKey(ngoId), ngoName: ngoNames.get(idKey(ngoId)) || '' } : { type: 'platform' },
      summary: {
        raised: round(donationTotals.amount), donationCount: donationTotals.count, uniqueDonors: donationStats.byDonor.length,
        repeatDonors: donationStats.byDonor.filter(row => row.count > 1).length,
        averageDonation: round(ratio(donationTotals.amount, donationTotals.count)),
        utilized: round(utilizationTotals.amount), utilizationCount: utilizationTotals.count, utilizationRate: ratio(utilizationTotals.amount, donationTotals.amount),
        beneficiariesReached: utilizationTotals.beneficiaries,
        balanceAllTime: round(fundTotal - utilizedTotal), raisedAllTime: round(fundTotal), utilizedAllTime: round(utilizedTotal),
        campaigns: campaigns.length, activeCampaigns: campaigns.filter(item => item.status === 'active').length,
        newCampaigns: campaigns.filter(item => item.createdAt >= range.from && item.createdAt < range.to).length,
        beneficiaryTarget: campaigns.reduce((sum, item) => sum + Number(item.beneficiaryTarget || 0), 0),
        beneficiariesServed: campaigns.reduce((sum, item) => sum + Number(item.beneficiariesServed || 0), 0),
        activityCount: activityStats.total[0]?.count || 0,
      },
      series: {
        donations: donationStats.series.map(row => ({ bucket: row._id, amount: round(row.amount), count: row.count })),
        utilizations: utilizationStats.series.map(row => ({ bucket: row._id, amount: round(row.amount) })),
      },
      utilizationByCategory: utilizationStats.byCategory.map(row => ({ category: row._id, label: UTILIZATION_CATEGORIES[row._id] || UTILIZATION_CATEGORIES.other, amount: round(row.amount), count: row.count })),
      campaigns: campaigns.map(campaign => {
        const id = idKey(campaign._id);
        const book = allTime.get(id) || { fund: 0, utilization: 0 };
        const recent = raisedByCampaign.get(id);
        const raisedAllTime = Math.max(book.fund, Number(campaign.raisedAmount || 0));
        return {
          id, title: campaign.title, ngoName: ngoNames.get(idKey(campaign.ngoId)) || campaign.ngoName, status: campaign.status, category: campaign.category,
          goalAmount: campaign.goalAmount, raisedAllTime: round(raisedAllTime), utilizedAllTime: round(book.utilization),
          goalProgress: ratio(raisedAllTime, campaign.goalAmount), utilizationRate: ratio(book.utilization, raisedAllTime),
          raisedInRange: round(recent?.amount || 0), donationsInRange: recent?.count || 0, donorsInRange: recent?.donors || 0,
          utilizedInRange: round(utilizedByCampaign.get(id) || 0), supporters: campaign.supporters || 0,
          beneficiaryTarget: campaign.beneficiaryTarget || 0, beneficiariesServed: campaign.beneficiariesServed || 0,
        };
      }).sort((a, b) => b.raisedInRange - a.raisedInRange || b.raisedAllTime - a.raisedAllTime),
      topDonors: donationStats.byDonor.slice(0, 10).map(row => ({ name: row.name, amount: round(row.amount), count: row.count })),
      donations: donations.map(item => ({ id: idKey(item._id), date: item.createdAt, donorName: item.donorName, campaignTitle: campaignTitles.get(idKey(item.campaignId)) || '', ngoName: ngoNames.get(idKey(item.ngoId)) || '', amount: item.amount })),
      utilizations: utilizationStats.entries.map(item => ({
        id: idKey(item._id), date: item.at, campaignTitle: item.campaignId ? campaignTitles.get(idKey(item.campaignId)) || '' : null, ngoName: ngoNames.get(idKey(item.ngoId)) || '',
        category: item.category || 'other', label: UTILIZATION_CATEGORIES[item.category] || UTILIZATION_CATEGORIES.other,
        description: item.description, amount: item.amount, beneficiariesReached: item.beneficiariesReached || 0, proofUrl: item.proofUrl || '',
      })),
      activityByAction: activityStats.byAction.map(row => ({ action: row._id, count: row.count })),
      activities: activityStats.entries.map(entry => ({
        id: idKey(entry._id), date: entry.createdAt, action: entry.action, entityType: entry.entityType,
        actorName: actors.get(idKey(entry.actorId))?.name || 'Unknown user', actorRole: actors.get(idKey(entry.actorId))?.role || '',
        ngoName: ngoNames.get(idKey(entry.ngoId)) || '', details: entry.details || {},
      })),
      truncated: { donations: donationTotals.count > LIST_LIMIT, utilizations: utilizationTotals.count > LIST_LIMIT, activities: (activityStats.total[0]?.count || 0) > LIST_LIMIT },
    };
    if (current.role === ROLES.SUPER_ADMIN) report.platform = await platformInsights(range);
    res.json(report);
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Report data is unavailable' }); }
};

export { fetchReports, fetchDetailedReport };
