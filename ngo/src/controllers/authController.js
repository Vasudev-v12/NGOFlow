import bcrypt from 'bcryptjs';
import { Ngo, User } from '../models/models.js';
import { ROLES, createAccessToken, getCurrentUserFromHeader, publicUser, recordActivity } from '../methods.js';

const register = async (req, res) => {
  try {
    const { name, email, password, ngoName, phone, bio } = req.body;
    const requestedRole = req.body.role;
    if (!name || !email || !password || !requestedRole) return res.status(422).json({ detail: 'Missing fields' });
    if (!['donor', 'ngo_admin', 'staff', 'admin'].includes(requestedRole)) return res.status(422).json({ detail: 'Invalid registration role' });
    if (String(password).length < 8) return res.status(422).json({ detail: 'Password must be at least 8 characters' });

    const role = requestedRole === 'admin' ? ROLES.NGO_ADMIN : requestedRole;
    const cleanEmail = String(email).trim().toLowerCase();
    if (await User.exists({ email: cleanEmail })) return res.status(409).json({ detail: 'An account with this email already exists' });
    if (role === ROLES.NGO_ADMIN && !String(ngoName || '').trim()) return res.status(422).json({ detail: 'NGO name is required for NGO administrators' });

    let ngo = null;
    if (role === ROLES.STAFF) {
      if (!String(ngoName || '').trim()) return res.status(422).json({ detail: 'Choose the NGO you will join' });
      ngo = await Ngo.findOne({ name: String(ngoName).trim(), status: 'active' });
      if (!ngo) return res.status(404).json({ detail: 'The requested NGO was not found' });
    }

    const user = await User.create({
      name: String(name).trim(), email: cleanEmail, passwordHash: bcrypt.hashSync(password, 10), role,
      status: role === ROLES.STAFF ? 'pending' : 'active', phone: String(phone || '').trim(),
      bio: String(bio || '').trim(), ngoId: ngo?._id || null,
    });

    if (role === ROLES.NGO_ADMIN) {
      const ngoTitle = String(ngoName).trim();
      const slug = ngoTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const createdNgo = await Ngo.create({ name: ngoTitle, slug: slug + '-' + user._id.toString().slice(-6), adminId: user._id, email: user.email });
      user.ngoId = createdNgo._id;
      user.permissions = ['staff', 'beneficiaries', 'campaigns', 'donations', 'reports'];
      await user.save();
      await recordActivity({ ngoId: createdNgo._id, actorId: user._id, action: 'ngo.created', entityType: 'ngo', entityId: createdNgo._id, details: { name: createdNgo.name } });
    }

    if (role === ROLES.STAFF && ngo) {
      await recordActivity({ ngoId: ngo._id, actorId: user._id, action: 'staff.registered', entityType: 'user', entityId: user._id, details: { status: user.status } });
    }

    const response = { message: user.status === 'active' ? 'Account created.' : 'Account created and awaiting NGO administrator activation.', user: publicUser(user) };
    if (user.status === 'active') { response.access_token = createAccessToken(user); response.token_type = 'bearer'; }
    res.status(201).json(response);
  } catch (error) {
    res.status(error.status || 500).json({ detail: error.message || 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    const user = await User.findOne({ email: String(req.body.email || '').trim().toLowerCase() });
    if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.passwordHash)) return res.status(401).json({ detail: 'Incorrect email or password' });
    if (user.status !== 'active') return res.status(403).json({ detail: 'This account is pending, inactive, or suspended' });
    res.json({ access_token: createAccessToken(user), token_type: 'bearer', user: publicUser(user) });
  } catch (error) { res.status(500).json({ detail: 'Unable to sign in' }); }
};

const me = async (req, res) => {
  try { res.json(publicUser(await getCurrentUserFromHeader(req.headers.authorization))); }
  catch (error) { res.status(error.status || 401).json({ detail: error.message }); }
};

export { register, login, me };
