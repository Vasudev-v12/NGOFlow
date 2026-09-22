import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import { bootstrapAdmin } from './models/models.js';
import authRoute from './routes/authRoute.js';
import campaignRoute from './routes/campaignRoute.js';
import profileRoute from './routes/profileRoute.js';
import dashboardRoute from './routes/dashboardRoute.js';
import userRoute from './routes/userRoute.js';
import donationRoute from './routes/donationRoute.js';
import reportRoute from './routes/reportRoute.js';
import fundRoute from './routes/fundRoute.js';
import activityRoute from './routes/activityRoute.js';
import ngoRoute from './routes/ngoRoute.js';
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);
dotenv.config();

const ROOT_DIR = import.meta.dirname;
const STATIC_DIR = path.join(ROOT_DIR, '../static');
const app = express();

app.use(express.json());
app.use(cors({ origin: (process.env.CORS_ORIGINS || 'http://localhost:5001').split(',') }));

app.use('/api/auth', authRoute);
app.use('/api/campaigns', campaignRoute);
app.use('/api/profile', profileRoute);
app.use('/api/dashboard', dashboardRoute);
app.use('/api/users', userRoute);
app.use('/api/donations', donationRoute);
app.use('/api/reports', reportRoute);
app.use('/api/funds', fundRoute);
app.use('/api/activities', activityRoute);
app.use('/api/ngos', ngoRoute);

app.get('/', (req, res) => res.sendFile(path.join(STATIC_DIR, 'home.html')));
app.get('/home', (req, res) => res.sendFile(path.join(STATIC_DIR, 'home.html')));
app.get('/register', (req, res) => res.sendFile(path.join(STATIC_DIR, 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(STATIC_DIR, 'login.html')));
app.get('/post-campaign', (req, res) => res.sendFile(path.join(STATIC_DIR, 'post-campaign.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(STATIC_DIR, 'dashboard.html')));

app.use('/static', express.static(STATIC_DIR));

const PORT = Number(process.env.PORT || 5001);

try {
  await connectDB();
  await bootstrapAdmin();
  app.listen(PORT, () => console.log(`NGOFlow Express API listening on ${PORT}`));
} catch (error) {
  console.error('Failed to start NGOFlow server:', error);
  process.exit(1);
}
