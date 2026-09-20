import bcrypt from 'bcryptjs';
import { User } from '../models/models.js';
import { publicUser, getCurrentUserFromHeader } from '../methods.js';

const patchProfile = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    const email = String(req.body.email || current.email).trim().toLowerCase();
    const existing = await User.findOne({ email, _id: { $ne: current._id } });

    if (existing) return res.status(409).json({ detail: 'An account with this email already exists' });

    const updated = await User.findByIdAndUpdate(
      current._id,
      {
        name: String(req.body.name || current.name).trim(),
        email,
        phone: String(req.body.phone || '').trim(),
        bio: String(req.body.bio || '').trim(),
      },
      { new: true }
    );

    res.json(publicUser(updated));
  } catch (e) {
    res.status(e.status || 401).json({ detail: e.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const current = await getCurrentUserFromHeader(req.headers.authorization);
    const user = await User.findById(current._id);

    if (!user) return res.status(404).json({ detail: 'User not found' });
    if (!bcrypt.compareSync(req.body.current_password, user.passwordHash)) return res.status(400).json({ detail: 'Your current password is incorrect' });
    if (bcrypt.compareSync(req.body.new_password, user.passwordHash)) return res.status(400).json({ detail: 'Choose a new password that differs from the current password' });

    user.passwordHash = bcrypt.hashSync(req.body.new_password, 10);
    await user.save();
    res.status(204).end();
  } catch (e) {
    res.status(e.status || 401).json({ detail: e.message });
  }
};

export { patchProfile, changePassword };