import { MongoClient, type Db } from "mongodb";

/**
 * Next.js long-running Node server: reuse one MongoClient across hot reloads.
 * Assumptions for this demo app (local OLTP, single process):
 * - maxPoolSize 10 — low concurrency employee CRUD
 * - minPoolSize 0 — no need to keep idle connections warm in local/dev
 * - maxIdleTimeMS 30s — prune idle sockets quickly
 */
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "employee_directory";

type GlobalMongo = {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
};

const globalForMongo = globalThis as typeof globalThis & {
  __mongo?: GlobalMongo;
};

function getCache(): GlobalMongo {
  if (!globalForMongo.__mongo) {
    globalForMongo.__mongo = { client: null, promise: null };
  }
  return globalForMongo.__mongo;
}

export async function getMongoClient(): Promise<MongoClient> {
  const cache = getCache();
  if (cache.client) return cache.client;

  if (!cache.promise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 30_000,
      connectTimeoutMS: 10_000,
      serverSelectionTimeoutMS: 5_000,
    });
    cache.promise = client.connect().then((connected) => {
      cache.client = connected;
      return connected;
    });
  }

  return cache.promise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}
