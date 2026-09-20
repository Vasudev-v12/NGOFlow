import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User } from './models/models.js';

dotenv.config();

const SECRET_KEY = process.env.SECRET_KEY || 'ngoflow-dev-secret';
const TOKEN_EXPIRE_MINUTES = Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || 60);

function publicUser(user) {
  const record = user && typeof user.toObject === 'function' ? user.toObject() : { ...user };
  return {
    id: record.id || record._id?.toString(),
    name: record.name,
    email: record.email,
    role: record.role,
    status: record.status,
    created_at: record.createdAt || record.created_at || null,
    phone: record.phone || '',
    bio: record.bio || '',
    ngoId: record.ngoId || null,
    permissions: record.permissions || [],
  };
}

function createAccessToken(user) {
  const userId = user.id || user._id?.toString();
  return jwt.sign({ sub: userId, role: user.role }, SECRET_KEY, { expiresIn: TOKEN_EXPIRE_MINUTES * 60 });
}

async function getCurrentUserFromHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, SECRET_KEY);
    const user = await User.findById(payload.sub).lean();

    if (!user || user.status !== 'active') {
      const err = new Error('This account is not active');
      err.status = 401;
      throw err;
    }

    return user;
  } catch (e) {
    const err = new Error('Invalid or expired session');
    err.status = 401;
    throw err;
  }
}

export { publicUser, createAccessToken, getCurrentUserFromHeader };