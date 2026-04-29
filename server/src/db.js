import mongoose from 'mongoose';

export async function connectDatabase(mongoUri) {
  if (!mongoUri) {
    console.warn('MONGO_URI is not set. Messages will be kept in memory only.');
    return false;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 3000
    });
    console.log('MongoDB connected');
    return true;
  } catch (error) {
    console.warn('MongoDB connection failed. Messages will be kept in memory only.');
    console.warn(error.message);
    return false;
  }
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}
