import { Campaign, Donation, Ngo, User } from '../models/models.js';
import { ROLES, getCurrentUserFromHeader, httpError, publicUser, recordActivity, requireRole, resolveTenantNgo } from '../methods.js';

const validStatuses = ['active', 'pending', 'inactive', 'suspended'];

const listUsers = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN, ROLES.NGO_ADMIN]);
    const query = current.role === ROLES.SUPER_ADMIN ? {} : { ngoId: await resolveTenantNgo(current) };
    const users = await User.find(query).sort({ createdAt: -1 }).lean();
    res.json(users.map(publicUser));
  } catch (error) { res.status(error.status || 500).json({ detail: error.message }); }
};

// Donors are visible only when a donation establishes their relationship to
// the caller's permitted NGO/campaigns; the frontend never supplies a scope.
const listDonors = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN, ROLES.NGO_ADMIN, ROLES.STAFF]);
    let donationScope = {};
    if (current.role === ROLES.NGO_ADMIN) donationScope = { ngoId: await resolveTenantNgo(current) };
    if (current.role === ROLES.STAFF) {
      const campaigns = await Campaign.find({ ngoId: await resolveTenantNgo(current), createdBy: current._id }).select('_id').lean();
      donationScope = { campaignId: { $in: campaigns.map(campaign => campaign._id) } };
    }
    const donorIds = await Donation.distinct('donorId', donationScope);
    const donors = await User.find({ _id: { $in: donorIds }, role: ROLES.DONOR }).sort({ name: 1 }).lean();
    res.json(donors.map(publicUser));
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Donor data is unavailable' }); }
};

const updateUserStatus = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN, ROLES.NGO_ADMIN]);
    const status = req.body.status;
    if (!validStatuses.includes(status)) throw httpError(422, 'Invalid account status');
    const target = await User.findById(req.params.userId);
    if (!target) throw httpError(404, 'User not found');
    if (target._id.equals(current._id)) throw httpError(400, 'You cannot change your own account status');
    if (current.role === ROLES.NGO_ADMIN) {
      const ngoId = await resolveTenantNgo(current);
      if (!target.ngoId?.equals(ngoId) || target.role !== ROLES.STAFF) throw httpError(403, 'You can manage only staff assigned to your NGO');
    }
    if (current.role !== ROLES.SUPER_ADMIN && target.role === ROLES.SUPER_ADMIN) throw httpError(403, 'You cannot manage Super Admin accounts');
    target.status = status;
    await target.save();
    if (target.ngoId) await recordActivity({ ngoId: target.ngoId, actorId: current._id, action: 'user.status_changed', entityType: 'user', entityId: target._id, details: { status } });
    res.json(publicUser(target));
  } catch (error) { res.status(error.status || 500).json({ detail: error.message }); }
};

const deleteUser = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN]);
    const target = await User.findById(req.params.userId);
    if (!target) throw httpError(404, 'User not found');
    if (target._id.equals(current._id)) throw httpError(400, 'You cannot delete your own account');
    if (target.role === ROLES.NGO_ADMIN && await Ngo.exists({ adminId: target._id })) throw httpError(409, 'Deactivate an NGO administrator instead of deleting the NGO owner');
    if (target.ngoId) await recordActivity({ ngoId: target.ngoId, actorId: current._id, action: 'user.deleted', entityType: 'user', entityId: target._id, details: { email: target.email, role: target.role } });
    await target.deleteOne();
    res.status(204).end();
  } catch (error) { res.status(error.status || 500).json({ detail: error.message }); }
};

export { listUsers, listDonors, updateUserStatus, deleteUser };
