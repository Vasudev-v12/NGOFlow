# NGOFlow

NGOFlow is a multi-tenant web platform for NGOs to manage fundraising and show donors where their money goes. NGOs register on the platform, their staff run fundraising campaigns, donors give to those campaigns, and NGO admins record how the money was spent. Donors can then see what share of their own donation has been used, and on what. Admins can generate detailed reports with charts and export them as PDF.


# DATABASE MODEL

                 ┌──────────── adminId ────────────┐
                 ▼                                 │
┌──────────────────┐ ngoId  ┌──────────────────┐   │
│      User        │───────►│       Ngo        │───┘
│ name, email(uniq)│        │ name, slug(uniq) │
│ passwordHash     │        │ adminId → User   │
│ role, status     │        │ email, phone     │
│ phone, bio       │        │ location,mission │
│ ngoId → Ngo      │        │ status           │
│ permissions[]    │        └────────┬─────────┘
└──┬───────┬───────┘                 │ ngoId (tenant key on all below)
   │       │ createdBy               ▼
   │       │               ┌──────────────────┐
   │       └──────────────►│    Campaign      │
   │                       │ ngoId, ngoName   │
   │ donorId               │ title, summary   │
   │                       │ category,location│
   │   ┌───────────────────│ goalAmount       │
   │   │ campaignId        │ raisedAmount     │
   ▼   ▼                   │ supporters       │
┌──────────────────┐       │ daysLeft         │
│    Donation      │       │ beneficiaryTarget│
│ donorId → User   │       │ beneficiariesSrvd│
│ campaignId       │       │ status, createdBy│
│ ngoId, amount    │       └────────▲─────────┘
│ donorName,message│                │ campaignId (nullable = NGO-wide)
│ status           │       ┌────────┴─────────┐
└────────▲─────────┘       │    FundEntry     │  (ledger)
         └── donationId ───│ ngoId, campaignId│
                           │ type: fund |     │
                           │   utilization    │
                           │ amount, desc.    │
                           │ category, date   │
                           │ beneficiaries    │
                           │ proofUrl         │
                           │ recordedBy → User│
                           └──────────────────┘
┌──────────────────┐       ┌──────────────────┐
│   ActivityLog    │       │  Notification    │ (defined, not yet used)
│ ngoId, actorId   │       │ userId, type     │
│ action,entityType│       │ title, message   │
│ entityId,details │       │ read             │
└──────────────────┘       └──────────────────┘


# API

POST /api/auth/register, POST /api/auth/login, GET /api/auth/me	Public; me needs a token
PATCH /api/profile, POST /api/profile/change-password	Any logged-in user
GET /api/campaigns (public) · POST, PATCH /:id, DELETE /:id	Write actions: Staff (own campaigns only)
GET /api/donations (scoped by role) · POST	POST: Donor
GET /api/funds · POST /api/funds/utilizations	POST: Super Admin and NGO Admin
GET /api/reports · GET /api/reports/detailed	detailed: Super Admin and NGO Admin
GET /api/dashboard/{super_admin, ngo_admin, staff, donor}	Matching role
GET /api/users, GET /api/users/donors, PATCH /:id/status, DELETE /:id	Admins (DELETE: Super Admin only)
GET /api/ngos, PATCH /:id/status	Super Admin
GET /api/activities	Super Admin and NGO Admin


# INSTALLATION AND RUN

1. Install dependencies

```bash
cd ngo
npm install
```

2. Copy `.env.example` to `.env` and set values

3. Run in development

```bash
npm start
```
4. open url: http://localhost:5001
