import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { ActivityLog, Ngo, User } from './models/models.js';

dotenv.config();

const SECRET_KEY = process.env.SECRET_KEY || 'ngoflow-dev-secret';
const TOKEN_EXPIRE_MINUTES = Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || 60);
const ROLES = Object.freeze({ SUPER_ADMIN: 'super_admin', NGO_ADMIN: 'ngo_admin', STAFF: 'staff', DONOR: 'donor' });

function publicUser(user) {
  const record = user && typeof user.toObject === 'function' ? user.toObject() : { ...user };
  return {
    id: record.id || record._id?.toString(), name: record.name, email: record.email, role: record.role,
    status: record.status, created_at: record.createdAt || record.created_at || null,
    phone: record.phone || '', bio: record.bio || '', ngoId: record.ngoId || null, permissions: record.permissions || [],
  };
}

function createAccessToken(user) {
  return jwt.sign({ sub: user.id || user._id?.toString(), role: user.role }, SECRET_KEY, { expiresIn: TOKEN_EXPIRE_MINUTES * 60 });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getCurrentUserFromHeader(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw httpError(401, 'Authentication required');
  try {
    const payload = jwt.verify(authHeader.slice(7), SECRET_KEY);
    const user = await User.findById(payload.sub).lean();
    if (!user || user.status !== 'active') throw httpError(401, 'This account is not active');
    return user;
  } catch (error) {
    if (error.status) throw error;
    throw httpError(401, 'Invalid or expired session');
  }
}

function requireRole(user, roles) {
  if (!roles.includes(user.role)) throw httpError(403, 'You do not have permission to perform this action');
}

async function resolveTenantNgo(user) {
  if (user.role === ROLES.SUPER_ADMIN) return null;
  const ngoId = user.ngoId || (user.role === ROLES.NGO_ADMIN ? (await Ngo.findOne({ adminId: user._id }).lean())?._id : null);
  if (!ngoId) throw httpError(403, 'Your account is not assigned to an NGO');
  return ngoId;
}

async function tenantQuery(user, field = 'ngoId') {
  if (user.role === ROLES.SUPER_ADMIN) return {};
  return { [field]: await resolveTenantNgo(user) };
}

async function recordActivity({ ngoId, actorId, action, entityType, entityId = null, details = {} }) {
  if (!ngoId) throw httpError(422, 'Audit activity must be associated with an NGO');
  return ActivityLog.create({ ngoId, actorId, action, entityType, entityId, details });
}

export { ROLES, publicUser, createAccessToken, getCurrentUserFromHeader, requireRole, resolveTenantNgo, tenantQuery, httpError, recordActivity };
