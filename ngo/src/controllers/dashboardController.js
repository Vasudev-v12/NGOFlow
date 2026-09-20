import { publicUser, getCurrentUserFromHeader } from '../methods.js';
import { User, Campaign, Beneficiary, Donation, Ngo } from '../models/models.js';

const admin = async (req, res) => {
  try {
    const user = await getCurrentUserFromHeader(req.headers.authorization);
    if (user.role !== 'admin') return res.status(403).json({ detail: 'Administrator access is required' });

    const users = await User.find().sort({ createdAt: -1 }).lean();
    const ngo = await Ngo.findOne({ adminId: user._id }).lean();
    const campaigns = await Campaign.find({ ngoId: ngo?._id || { $exists: true } }).sort({ createdAt: -1 }).lean();
    const beneficiaries = await Beneficiary.find({ ngoId: ngo?._id || { $exists: true } }).sort({ createdAt: -1 }).lean();
    const donations = await Donation.find({ ngoId: ngo?._id || { $exists: true } }).sort({ createdAt: -1 }).lean();

    const dashboard = {
      user: publicUser(user),
      users: users.map(publicUser),
      campaigns: campaigns.map((item) => ({ ...item, id: item._id.toString(), ngo_name: item.ngoName, goal_amount: item.goalAmount, raised_amount: item.raisedAmount, days_left: item.daysLeft })),
      beneficiaries: beneficiaries.map((item) => ({ ...item, id: item._id.toString() })),
      donations: donations.map((item) => ({ ...item, id: item._id.toString(), amount: item.amount, createdAt: item.createdAt })),
      total_users: users.length,
      staff_count: users.filter((entry) => entry.role === 'staff').length,
      donor_count: users.filter((entry) => entry.role === 'donor').length,
      inactive_count: users.filter((entry) => entry.status === 'inactive').length,
      pending_users: users.filter((entry) => entry.status === 'pending'),
      total_raised: donations.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      total_beneficiaries: beneficiaries.length,
      total_campaigns: campaigns.length,
    };

    res.json(dashboard);
  } catch (e) {
    res.status(e.status || 401).json({ detail: e.message });
  }
};

const staff = async (req, res) => {
  try {
    const user = await getCurrentUserFromHeader(req.headers.authorization);
    if (user.role !== 'staff') return res.status(403).json({ detail: 'NGO staff access is required' });

    const ngo = await Ngo.findOne({ _id: user.ngoId }).lean();
    const campaigns = await Campaign.find({ ngoId: user.ngoId || ngo?._id }).sort({ createdAt: -1 }).lean();
    const beneficiaries = await Beneficiary.find({ ngoId: user.ngoId || ngo?._id }).sort({ createdAt: -1 }).lean();
    const donations = await Donation.find({ ngoId: user.ngoId || ngo?._id }).sort({ createdAt: -1 }).lean();

    res.json({
      user: publicUser(user),
      ngo: ngo || null,
      campaigns: campaigns.map((item) => ({ ...item, id: item._id.toString(), ngo_name: item.ngoName, goal_amount: item.goalAmount, raised_amount: item.raisedAmount, days_left: item.daysLeft })),
      beneficiaries: beneficiaries.map((item) => ({ ...item, id: item._id.toString() })),
      donations: donations.map((item) => ({ ...item, id: item._id.toString(), amount: item.amount })),
      giving_history: donations.map((item) => ({ date: item.createdAt, program: item.donorName, amount: `₹${item.amount}` })),
      projects: campaigns,
    });
  } catch (e) {
    res.status(e.status || 401).json({ detail: e.message });
  }
};

const donor = async (req, res) => {
  try {
    const user = await getCurrentUserFromHeader(req.headers.authorization);
    if (user.role !== 'donor') return res.status(403).json({ detail: 'Donor access is required' });

    const donations = await Donation.find({ donorId: user._id }).sort({ createdAt: -1 }).lean();
    const campaigns = await Campaign.find().sort({ createdAt: -1 }).lean();

    res.json({
      user: publicUser(user),
      campaigns: campaigns.map((item) => ({ ...item, id: item._id.toString(), ngo_name: item.ngoName, goal_amount: item.goalAmount, raised_amount: item.raisedAmount, days_left: item.daysLeft })),
      giving_history: donations.map((item) => ({ date: item.createdAt, program: item.message || 'Campaign contribution', amount: `₹${item.amount}` })),
      total_given: donations.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    });
  } catch (e) {
    res.status(e.status || 401).json({ detail: e.message });
  }
};

export { admin, staff, donor };