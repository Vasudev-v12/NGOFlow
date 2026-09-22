import { ActivityLog } from '../models/models.js';
import { ROLES, getCurrentUserFromHeader, requireRole, tenantQuery } from '../methods.js';

const listActivities = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN, ROLES.NGO_ADMIN]);
    const activities = await ActivityLog.find(await tenantQuery(current)).sort({ createdAt: -1 }).limit(200).lean();
    res.json(activities.map(item => ({ ...item, id: item._id.toString() })));
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'Activity data is unavailable' }); }
};

export { listActivities };
