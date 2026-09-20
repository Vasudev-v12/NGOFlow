import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'staff', 'donor'], required: true },
    status: { type: String, enum: ['active', 'pending', 'inactive'], default: 'active' },
    phone: { type: String, default: '' },
    bio: { type: String, default: '' },
    ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', default: null },
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
    ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', default: null },
    ngoName: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    summary: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    goalAmount: { type: Number, required: true },
    raisedAmount: { type: Number, default: 0 },
    supporters: { type: Number, default: 0 },
    daysLeft: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'active', 'completed'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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

const beneficiarySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', required: true },
    category: { type: String, default: 'General' },
    location: { type: String, default: '' },
    needs: { type: String, default: '' },
    status: { type: String, enum: ['active', 'pending', 'supported'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

beneficiarySchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const donationSchema = new mongoose.Schema(
  {
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
    ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', required: true },
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

notificationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Ngo = mongoose.models.Ngo || mongoose.model('Ngo', ngoSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const Beneficiary = mongoose.models.Beneficiary || mongoose.model('Beneficiary', beneficiarySchema);
const Donation = mongoose.models.Donation || mongoose.model('Donation', donationSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

async function bootstrapAdmin() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@ngoflow.local';
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!adminPassword) {
    return;
  }

  const existingAdmin = await User.findOne({ email: adminEmail.toLowerCase() });
  if (existingAdmin) {
    return;
  }

  const admin = await User.create({
    name: process.env.BOOTSTRAP_ADMIN_NAME || 'NGOFlow Administrator',
    email: adminEmail.toLowerCase(),
    passwordHash: await import('bcryptjs').then(({ default: bcrypt }) => bcrypt.hashSync(adminPassword, 10)),
    role: 'admin',
    status: 'active',
    permissions: ['users', 'campaigns', 'beneficiaries', 'donations', 'reports'],
  });

  await Ngo.findOneAndUpdate(
    { adminId: admin._id },
    {
      name: 'NGOFlow Foundation',
      slug: 'ngoflow-foundation',
      adminId: admin._id,
      email: admin.email,
      status: 'active',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export { User, Ngo, Campaign, Beneficiary, Donation, Notification, bootstrapAdmin };