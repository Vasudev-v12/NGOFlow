import mongoose from 'mongoose';
import { Campaign, Donation, FundEntry, Ngo, UTILIZATION_CATEGORIES } from '../models/models.js';

// Donor fund tracking. A donor's money is pooled with everyone else's in a campaign, so the
// amount of "their" money that was spent is attributed pro-rata: their share of the campaign's
// receipts multiplied by what the campaign has utilized. NGO-wide (non-campaign) spending is
// reported per NGO for transparency but is not attributed to campaign donors.

const round = value => Math.round(value * 100) / 100;
const rate = (part, whole) => (whole > 0 ? Math.min(1, part / whole) : 0);
const categoryList = totals => Object.entries(totals)
  .filter(([, amount]) => amount > 0)
  .map(([category, amount]) => ({ category, label: UTILIZATION_CATEGORIES[category] || UTILIZATION_CATEGORIES.other, amount: round(amount) }))
  .sort((a, b) => b.amount - a.amount);
const addTo = (totals, category, amount) => { totals[category] = (totals[category] || 0) + amount; };

async function buildDonorImpact(user) {
  const donations = await Donation.find({ donorId: user._id, status: 'success' }).sort({ createdAt: -1 }).lean();
  const emptySummary = { totalGiven: 0, donationCount: 0, campaignsSupported: 0, ngosSupported: 0, utilizedEstimate: 0, unspentEstimate: 0, utilizationRate: 0, beneficiariesServed: 0 };
  if (!donations.length) return { summary: emptySummary, categories: [], campaigns: [], ngos: [], recentUtilizations: [] };

  const given = new Map();
  for (const item of donations) {
    const key = item.campaignId.toString();
    const entry = given.get(key) || { amount: 0, count: 0, lastAt: item.createdAt };
    entry.amount += Number(item.amount || 0);
    entry.count += 1;
    given.set(key, entry);
  }
  const campaignIds = [...new Set(donations.map(item => item.campaignId.toString()))];
  const ngoIds = [...new Set(donations.map(item => item.ngoId.toString()))];

  const [campaigns, ngos, totals, utilizations] = await Promise.all([
    Campaign.find({ _id: { $in: campaignIds } }).lean(),
    Ngo.find({ _id: { $in: ngoIds } }).select('name location mission').lean(),
    FundEntry.aggregate([
      // Aggregation pipelines skip schema casting, so match on ObjectIds rather than strings.
      { $match: { ngoId: { $in: ngoIds.map(id => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: { ngoId: '$ngoId', campaignId: '$campaignId', type: '$type', category: { $ifNull: ['$category', 'other'] } }, amount: { $sum: '$amount' }, beneficiaries: { $sum: { $ifNull: ['$beneficiariesReached', 0] } } } },
    ]),
    FundEntry.find({ type: 'utilization', ngoId: { $in: ngoIds }, $or: [{ campaignId: { $in: campaignIds } }, { campaignId: null }] })
      .select('-recordedBy').sort({ utilizedOn: -1, createdAt: -1 }).limit(50).lean(),
  ]);

  // Per-campaign and per-NGO ledgers built from the aggregated fund entries.
  const campaignLedger = new Map();
  const ngoLedger = new Map();
  const ledger = (map, key) => {
    if (!map.has(key)) map.set(key, { received: 0, utilized: 0, general: 0, beneficiaries: 0, categories: {} });
    return map.get(key);
  };
  for (const row of totals) {
    const { ngoId, campaignId, type, category } = row._id;
    const ngo = ledger(ngoLedger, ngoId.toString());
    const campaign = campaignId ? ledger(campaignLedger, campaignId.toString()) : null;
    if (type === 'fund') {
      ngo.received += row.amount;
      if (campaign) campaign.received += row.amount;
      continue;
    }
    ngo.utilized += row.amount;
    ngo.beneficiaries += row.beneficiaries;
    addTo(ngo.categories, category, row.amount);
    if (campaign) {
      campaign.utilized += row.amount;
      campaign.beneficiaries += row.beneficiaries;
      addTo(campaign.categories, category, row.amount);
    } else {
      ngo.general += row.amount;
    }
  }

  const ngoNames = new Map(ngos.map(item => [item._id.toString(), item.name]));
  const campaignTitles = new Map(campaigns.map(item => [item._id.toString(), item.title]));
  const donorCategories = {};
  const donorByNgo = new Map();

  const campaignRows = campaigns.map(campaign => {
    const id = campaign._id.toString();
    const mine = given.get(id);
    const book = campaignLedger.get(id) || { received: 0, utilized: 0, beneficiaries: 0, categories: {} };
    const received = Math.max(book.received, Number(campaign.raisedAmount || 0), mine.amount);
    const share = rate(mine.amount, received);
    const yourUtilized = share * book.utilized;
    for (const [category, amount] of Object.entries(book.categories)) addTo(donorCategories, category, share * amount);
    const ngoKey = campaign.ngoId.toString();
    const ngoTotals = donorByNgo.get(ngoKey) || { given: 0, utilized: 0 };
    ngoTotals.given += mine.amount;
    ngoTotals.utilized += yourUtilized;
    donorByNgo.set(ngoKey, ngoTotals);
    return {
      id, title: campaign.title, ngoId: ngoKey, ngoName: ngoNames.get(ngoKey) || campaign.ngoName, status: campaign.status,
      category: campaign.category, location: campaign.location, goalAmount: campaign.goalAmount,
      raisedAmount: round(received), utilizedAmount: round(book.utilized), balance: round(Math.max(0, received - book.utilized)),
      utilizationRate: rate(book.utilized, received), beneficiaryTarget: campaign.beneficiaryTarget || 0,
      beneficiariesServed: campaign.beneficiariesServed || 0, beneficiariesReached: book.beneficiaries,
      yourContribution: round(mine.amount), yourDonationCount: mine.count, yourShare: share, yourUtilized: round(yourUtilized),
      lastDonationAt: mine.lastAt, categories: categoryList(book.categories),
    };
  }).sort((a, b) => b.yourContribution - a.yourContribution);

  const ngoRows = ngos.map(ngo => {
    const id = ngo._id.toString();
    const book = ngoLedger.get(id) || { received: 0, utilized: 0, general: 0, categories: {} };
    const mine = donorByNgo.get(id) || { given: 0, utilized: 0 };
    return {
      id, name: ngo.name, location: ngo.location || '', mission: ngo.mission || '',
      yourContribution: round(mine.given), yourUtilized: round(mine.utilized),
      totalReceived: round(book.received), totalUtilized: round(book.utilized), generalUtilized: round(book.general),
      utilizationRate: rate(book.utilized, book.received), categories: categoryList(book.categories),
    };
  }).sort((a, b) => b.yourContribution - a.yourContribution);

  const totalGiven = donations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const utilizedEstimate = campaignRows.reduce((sum, item) => sum + item.yourUtilized, 0);
  return {
    summary: {
      totalGiven: round(totalGiven), donationCount: donations.length, campaignsSupported: campaignRows.length, ngosSupported: ngoRows.length,
      utilizedEstimate: round(utilizedEstimate), unspentEstimate: round(Math.max(0, totalGiven - utilizedEstimate)),
      utilizationRate: rate(utilizedEstimate, totalGiven),
      beneficiariesServed: campaignRows.reduce((sum, item) => sum + item.beneficiariesServed, 0),
    },
    categories: categoryList(donorCategories),
    campaigns: campaignRows,
    ngos: ngoRows,
    recentUtilizations: utilizations.map(item => ({
      id: item._id.toString(), ngoId: item.ngoId.toString(), ngoName: ngoNames.get(item.ngoId.toString()) || '',
      campaignId: item.campaignId ? item.campaignId.toString() : null,
      campaignTitle: item.campaignId ? campaignTitles.get(item.campaignId.toString()) || '' : null,
      category: item.category || 'other', label: UTILIZATION_CATEGORIES[item.category] || UTILIZATION_CATEGORIES.other,
      amount: item.amount, description: item.description, utilizedOn: item.utilizedOn || item.createdAt,
      beneficiariesReached: item.beneficiariesReached || 0, proofUrl: item.proofUrl || '',
    })),
  };
}

export { buildDonorImpact };
