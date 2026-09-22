import { Ngo } from '../models/models.js';
import { ROLES, getCurrentUserFromHeader, httpError, recordActivity, requireRole } from '../methods.js';

const serializeNgo = ngo => ({ ...ngo, id: ngo._id.toString() });

const listNgos = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN]);
    const ngos = await Ngo.find().sort({ createdAt: -1 }).lean();
    res.json(ngos.map(serializeNgo));
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'NGO data is unavailable' }); }
};

const updateNgoStatus = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    requireRole(current, [ROLES.SUPER_ADMIN]);
    const status = req.body.status;
    if (!['active', 'inactive'].includes(status)) throw httpError(422, 'Invalid NGO status');
    const ngo = await Ngo.findById(req.params.ngoId);
    if (!ngo) throw httpError(404, 'NGO not found');
    ngo.status = status;
    await ngo.save();
    await recordActivity({ ngoId: ngo._id, actorId: current._id, action: 'ngo.status_changed', entityType: 'ngo', entityId: ngo._id, details: { status } });
    res.json(serializeNgo(ngo.toObject()));
  } catch (error) { res.status(error.status || 500).json({ detail: error.message || 'NGO status could not be updated' }); }
};

export { listNgos, updateNgoStatus };
