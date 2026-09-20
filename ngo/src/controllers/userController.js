import { User } from '../models/models.js';
import { getCurrentUserFromHeader, publicUser } from '../methods.js';

const user = async (req, res) => {
  try {
    const admin = await getCurrentUserFromHeader(req.headers.authorization);
    if (admin.role !== 'admin') return res.status(403).json({ detail: 'Administrator access is required' });

    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json(users.map(publicUser));
  } catch (e) {
    res.status(e.status || 401).json({ detail: e.message });
  }
};

const userStatus = async (req, res) => {
  try {
    const admin = await getCurrentUserFromHeader(req.headers.authorization);
    if (admin.role !== 'admin') return res.status(403).json({ detail: 'Administrator access is required' });

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ detail: 'User not found' });

    if (user._id.toString() === admin._id.toString() && req.body.status !== 'active') {
      return res.status(400).json({ detail: 'You cannot deactivate your own account' });
    }

    if (user.role === 'admin' && req.body.status !== 'active') {
      return res.status(400).json({ detail: 'Administrator accounts must remain active' });
    }

    user.status = req.body.status;
    await user.save();
    res.json(publicUser(user));
  } catch (e) {
    res.status(e.status || 401).json({ detail: e.message });
  }
};

export { user, userStatus };