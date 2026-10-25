# 🌍 NGOFlow

> A comprehensive multi-tenant platform for NGOs to manage fundraising campaigns and transparently track fund utilization for donors.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-4.18+-blue?style=flat-square&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-9.10+-green?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Database Architecture](#database-architecture)
- [API Endpoints](#api-endpoints)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [User Roles & Permissions](#user-roles--permissions)
- [Development](#development)

---

## 🎯 Overview

**NGOFlow** is a full-featured platform designed to revolutionize how NGOs manage fundraising campaigns and demonstrate accountability to donors. 

### The Problem
Donors often wonder: *"Where does my money go?"* Traditional fundraising lacks transparency, making it difficult for donors to track the impact of their contributions.

### Our Solution
NGOFlow bridges this gap by creating a transparent ecosystem where:
- **NGOs** register and manage fundraising campaigns
- **Staff** track fund collection and utilization in real-time
- **Donors** can see exactly how their money is being used
- **Admins** generate detailed reports with visual charts and PDF exports

---

## ✨ Key Features

### For NGOs
- 🏢 **Multi-tenant Organization Management** - Host multiple NGOs on a single platform
- 📊 **Campaign Management** - Create, track, and monitor fundraising campaigns
- 💾 **Fund Ledger** - Maintain detailed records of fund utilization with categories and proof documents
- 📈 **Analytics Dashboard** - View real-time fundraising progress and beneficiary impact
- 🔐 **Role-based Access Control** - Super Admin, NGO Admin, and Staff roles with granular permissions

### For Donors
- 👁️ **Transparency** - View detailed breakdown of how donations are used
- 🎯 **Campaign Tracking** - Monitor campaigns from creation to completion
- 📱 **Donation History** - See all personal donations and their impact
- 💝 **Custom Messages** - Add personalized messages to donations

### For Administrators
- 📋 **Activity Logging** - Track all actions performed on the platform
- 📄 **Report Generation** - Generate detailed reports with charts
- 📥 **PDF Export** - Download reports for official documentation
- 👥 **User Management** - Manage users, verify donors, and handle permissions

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js 4.18 |
| **Database** | MongoDB 9.10 |
| **Authentication** | JWT (JSON Web Tokens) |
| **Password Hashing** | bcryptjs |
| **Development** | Nodemon, dotenv |

---

## 🗂 Database Architecture

NGOFlow uses a well-structured MongoDB schema with multi-tenant support. Below is the complete data model:

```
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
│   ActivityLog    │       │  Notification    │
│ ngoId, actorId   │       │ userId, type     │
│ action,entityType│       │ title, message   │
│ entityId,details │       │ read             │
└──────────────────┘       └──────────────────┘
```

### Key Entities

| Entity | Purpose |
|--------|---------|
| **User** | System users with roles (Super Admin, NGO Admin, Staff, Donor) |
| **NGO** | Organization profile with admin, contact, and mission details |
| **Campaign** | Fundraising initiatives with goals and progress tracking |
| **Donation** | Individual donor contributions linked to campaigns |
| **FundEntry** | Ledger entries tracking fund utilization and categories |
| **ActivityLog** | Audit trail of all platform activities |
| **Notification** | User notifications (framework in place) |

---

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/register          - Register a new user (Public)
POST   /api/auth/login             - Login user (Public)
GET    /api/auth/me                - Get current user (Authenticated)
```

### Profile Management
```
PATCH  /api/profile                - Update user profile (Authenticated)
POST   /api/profile/change-password - Change password (Authenticated)
```

### Campaigns
```
GET    /api/campaigns              - Get all campaigns (Public)
POST   /api/campaigns              - Create campaign (Staff)
PATCH  /api/campaigns/:id          - Update campaign (Staff - own only)
DELETE /api/campaigns/:id          - Delete campaign (Staff - own only)
```

### Donations
```
GET    /api/donations              - Get donations (scoped by role)
POST   /api/donations              - Create donation (Donor)
```

### Funds & Tracking
```
GET    /api/funds                  - Get fund entries (Admin)
POST   /api/funds/utilizations     - Record fund utilization (NGO Admin, Super Admin)
```

### Reports & Analytics
```
GET    /api/reports                - Get reports (Admin)
GET    /api/reports/detailed       - Get detailed reports (Super Admin, NGO Admin)
```

### Dashboard
```
GET    /api/dashboard/super_admin  - Super admin dashboard
GET    /api/dashboard/ngo_admin    - NGO admin dashboard
GET    /api/dashboard/staff        - Staff dashboard
GET    /api/dashboard/donor        - Donor dashboard
```

### User Management
```
GET    /api/users                  - List users (Admin)
GET    /api/users/donors           - List donors (Admin)
PATCH  /api/users/:id/status       - Update user status (Admin)
DELETE /api/users/:id              - Delete user (Super Admin only)
```

### NGO Management
```
GET    /api/ngos                   - List NGOs (Super Admin)
PATCH  /api/ngos/:id/status        - Update NGO status (Super Admin)
```

### Activity Logs
```
GET    /api/activities             - View activity logs (Super Admin, NGO Admin)
```

---

## 👥 User Roles & Permissions

| Role | Permissions |
|------|-----------|
| **Super Admin** | Full platform access, manage all NGOs, users, and system settings |
| **NGO Admin** | Manage own NGO, view reports, manage staff and donors |
| **Staff** | Create/manage campaigns, record fund utilization |
| **Donor** | View campaigns, make donations, track donation impact |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18 or higher
- **MongoDB** instance (local or cloud)
- **npm** or **yarn** package manager

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/ngoflow.git
cd ngoflow
```

2. **Install dependencies**
```bash
cd ngo
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` and set the following:
```env
PORT=5001
MONGODB_URI=mongodb://localhost:27017/ngoflow
JWT_SECRET=your_jwt_secret_key
NODE_ENV=development
```

4. **Start the development server**
```bash
npm start
```

The API will be available at: **http://localhost:5001**

---

## 📁 Project Structure

```
ngoflow/
├── ngo/                          # Main application directory
│   ├── src/
│   │   ├── server.js            # Express server entry point
│   │   ├── models/              # MongoDB schemas
│   │   ├── controllers/         # Request handlers
│   │   ├── routes/              # API route definitions
│   │   ├── middleware/          # Authentication & validation
│   │   └── utils/               # Helper functions
│   ├── .env.example             # Environment variables template
│   ├── package.json             # Dependencies
│   └── README.md                # Project documentation
├── users.json                    # Sample user data
└── README.md                     # This file
```

---

## 💻 Development

### Running in Development Mode
```bash
cd ngo
npm run dev    # Uses nodemon for auto-reload
```

### Running Tests (if available)
```bash
npm test
```

### Building for Production
```bash
npm run build
NODE_ENV=production npm start
```

---

## 🔐 Security Features

- ✅ **Password Hashing** with bcryptjs
- ✅ **JWT Authentication** for secure API access
- ✅ **CORS** enabled for cross-origin requests
- ✅ **Multi-tenant Isolation** - NGO data segregation
- ✅ **Role-based Access Control** - Permission enforcement
- ✅ **Activity Logging** - Complete audit trail

---

## 📝 License

This project is licensed under the **MIT License** - see the LICENSE file for details.

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📧 Support & Contact

For questions or support, please reach out to:
- **Email**: support@ngoflow.com
- **Issues**: [GitHub Issues](https://github.com/yourusername/ngoflow/issues)

---

<div align="center">

**Made with ❤️ for transparent fundraising**

</div>
