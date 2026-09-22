import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['super_admin', 'ngo_admin', 'staff', 'donor'], required: true },
    status: { type: String, enum: ['active', 'pending', 'inactive', 'suspended'], default: 'active' },
    phone: { type: String, default: '' },
    bio: { type: String, default: '' },
    ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', default: null, index: true },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

const ngoSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    location: { type: String, default: '' },
    mission: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

ngoSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const campaignSchema = new mongoose.Schema(
  {
    ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', required: true, index: true },
    ngoName: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    summary: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    goalAmount: { type: Number, required: true },
    raisedAmount: { type: Number, default: 0 },
    supporters: { type: Number, default: 0 },
    daysLeft: { type: Number, required: true },
    beneficiaryTarget: { type: Number, default: 0, min: 0 },
    beneficiariesServed: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['draft', 'active', 'completed'], default: 'active' },
    // Campaign ownership is deliberately immutable after creation. It is the
    // authorization boundary for staff edits and deletes.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  },
  { timestamps: true }
);

campaignSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const donationSchema = new mongoose.Schema(
  {
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    donorName: { type: String, required: true },
    message: { type: String, default: '' },
    status: { type: String, enum: ['success', 'pending', 'failed'], default: 'success' },
  },
  { timestamps: true }
);

donationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['system', 'campaign', 'donation'], default: 'system' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const fundEntrySchema = new mongoose.Schema(
  {
    ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', required: true, index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null, index: true },
    type: { type: String, enum: ['fund', 'utilization'], required: true },
    amount: { type: Number, required: true, min: 1 },
    description: { type: String, default: '', trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const activityLogSchema = new mongoose.Schema(
  {
    // Audit entries are tenant records. Platform-only events should not be
    // recorded here because they cannot be safely isolated to an NGO.
    ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

campaignSchema.index({ ngoId: 1, createdBy: 1, createdAt: -1 });
donationSchema.index({ ngoId: 1, campaignId: 1, createdAt: -1 });
fundEntrySchema.index({ ngoId: 1, campaignId: 1, createdAt: -1 });
activityLogSchema.index({ ngoId: 1, createdAt: -1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Ngo = mongoose.models.Ngo || mongoose.model('Ngo', ngoSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const Donation = mongoose.models.Donation || mongoose.model('Donation', donationSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
const FundEntry = mongoose.models.FundEntry || mongoose.model('FundEntry', fundEntrySchema);
const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);

async function bootstrapAdmin() {
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!adminPassword) {
    return;
  }

  // Upgrade legacy records from the earlier three-role implementation.
  await User.updateMany({ role: 'admin', email: { $ne: adminEmail } }, { $set: { role: 'ngo_admin' } });
  await User.updateOne({ email: adminEmail }, { $set: { role: 'super_admin', status: 'active' } });

  const existingAdmin = await User.findOne({ email: adminEmail });
  if (existingAdmin) {
    return;
  }

  const admin = await User.create({
    name: process.env.BOOTSTRAP_ADMIN_NAME || 'NGOFlow Administrator',
    email: adminEmail.toLowerCase(),
    passwordHash: await import('bcryptjs').then(({ default: bcrypt }) => bcrypt.hashSync(adminPassword, 10)),
    role: 'super_admin',
    status: 'active',
    permissions: ['users', 'campaigns', 'beneficiaries', 'donations', 'reports'],
  });

  // A Super Admin owns the platform, not a tenant NGO.
}

export { User, Ngo, Campaign, Donation, Notification, FundEntry, ActivityLog, bootstrapAdmin };
