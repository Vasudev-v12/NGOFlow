import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

let isConnected = false;

const candidateUris = [
  process.env.MONGODB_URI
  // 'mongodb://127.0.0.1:27017/ngoflow',
  // 'mongodb://localhost:27017/ngoflow',
].filter(Boolean);

export default async function connectDB() {
  if (isConnected) return mongoose.connection;

  let lastError = null;

  for (const uri of candidateUris) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        autoIndex: true,
      });

      isConnected = true;
      console.log(`MongoDB connected successfully using ${uri}`);
      return mongoose.connection;
    } catch (error) {
      lastError = error;
      console.warn(`MongoDB connection failed for ${uri}:`, error.message);
    }
  }

  throw new Error(`Unable to connect to MongoDB. Last error: ${lastError?.message || 'unknown error'}`);
}
