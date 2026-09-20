import { Beneficiary, Ngo } from '../models/models.js';
import { getCurrentUserFromHeader } from '../methods.js';

const listBeneficiaries = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    if (current.role === 'donor') {
      return res.status(403).json({ detail: 'NGO staff or admin access is required' });
    }

    const ngo = current.ngoId ? await Ngo.findById(current.ngoId) : await Ngo.findOne({ adminId: current._id });
    const beneficiaries = await Beneficiary.find({ ngoId: ngo?._id || current.ngoId }).sort({ createdAt: -1 }).lean();

    res.json(beneficiaries.map((item) => ({ ...item, id: item._id.toString() })));
  } catch (error) {
    res.status(error.status || 500).json({ detail: error.message || 'Beneficiary data is unavailable' });
  }
};

const createBeneficiary = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    if (current.role === 'donor') {
      return res.status(403).json({ detail: 'NGO staff or admin access is required' });
    }

    const payload = req.body || {};
    const ngo = current.ngoId ? await Ngo.findById(current.ngoId) : await Ngo.findOne({ adminId: current._id });

    const beneficiary = await Beneficiary.create({
      name: String(payload.name || '').trim(),
      ngoId: ngo?._id || current.ngoId,
      category: String(payload.category || 'General').trim(),
      location: String(payload.location || '').trim(),
      needs: String(payload.needs || '').trim(),
      status: String(payload.status || 'active').trim(),
      createdBy: current._id,
    });

    res.status(201).json({ ...beneficiary.toObject(), id: beneficiary._id.toString() });
  } catch (error) {
    res.status(error.status || 500).json({ detail: error.message || 'Beneficiary could not be created' });
  }
};

export { listBeneficiaries, createBeneficiary };
