import bcrypt from 'bcryptjs';
import { User, Ngo } from '../models/models.js';
import { createAccessToken, publicUser, getCurrentUserFromHeader } from '../methods.js';

const register = async (req, res) => {
  const { name, email, password, role = 'donor', ngoName, phone, bio } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(422).json({ detail: 'Missing fields' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const existingUser = await User.findOne({ email: cleanEmail });

  if (existingUser) {
    return res.status(409).json({ detail: 'An account with this email already exists' });
  }

  const normalizedRole = ['admin', 'staff', 'donor'].includes(role) ? role : 'donor';
  const user = new User({
    name: String(name).trim(),
    email: cleanEmail,
    passwordHash: bcrypt.hashSync(password, 10),
    role: normalizedRole,
    status: normalizedRole === 'staff' ? 'pending' : 'active',
    phone: String(phone || '').trim(),
    bio: String(bio || '').trim(),
  });

  await user.save();

  if (normalizedRole === 'admin') {
    const safeNgoname = String(ngoName || `${user.name}'s NGO`).trim() || 'NGOFlow Foundation';
    const slugValue = safeNgoname.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await Ngo.findOneAndUpdate(
      { adminId: user._id },
      { name: safeNgoname, slug: slugValue, adminId: user._id, email: user.email },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await User.findByIdAndUpdate(user._id, { ngoId: (await Ngo.findOne({ adminId: user._id }))._id });
  }

  if (normalizedRole === 'staff' && ngoName) {
    const ngo = await Ngo.findOne({ name: String(ngoName).trim() });
    if (ngo) {
      await User.findByIdAndUpdate(user._id, { ngoId: ngo._id, permissions: ['donors','beneficiaries','campaigns'] });
    }
  }

  const response = {
    message: user.status === 'active' ? 'Account created.' : 'Account created and awaiting administrator activation.',
    user: publicUser(user),
  };

  if (user.status === 'active') {
    response.access_token = createAccessToken(user);
    response.token_type = 'bearer';
  }

  res.status(201).json(response);
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email).trim().toLowerCase() });

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ detail: 'Incorrect email or password' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ detail: 'This account is awaiting activation or has been deactivated' });
  }

  res.json({ access_token: createAccessToken(user), token_type: 'bearer', user: publicUser(user) });
};

const me = async (req, res) => {
  try {
    const user = await getCurrentUserFromHeader(req.headers.authorization);
    res.json(publicUser(user));
  } catch (e) {
    res.status(e.status || 401).json({ detail: e.message });
  }
};

export { register, login, me };