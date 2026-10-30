import mongoose from 'mongoose';
import { env } from './env.js';

let transactionsSupported = null;

export async function connectDb(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch {
    transactionsSupported = false;
  }
  if (!transactionsSupported) {
    console.warn('[db] Not a replica set: commands run without multi-document transactions.');
  }
  return mongoose.connection;
}

export const supportsTransactions = () => transactionsSupported === true;

export async function disconnectDb() {
  await mongoose.disconnect();
}
