import { createHash, randomBytes } from "crypto";
import { getDb } from "@/lib/mongodb";
import { REFRESH_TOKEN_TTL_MS } from "@/lib/session-ttl";
import type { AuthUser } from "@/lib/types";

const COLLECTION = "refresh_tokens";

type RefreshTokenRecord = {
  id: string;
  tokenHash: string;
  userId: string;
  email: string;
  name: string;
  kind: "admin" | "employee";
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date;
};

let indexesReady: Promise<void> | null = null;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function collection() {
  const db = await getDb();
  const col = db.collection<RefreshTokenRecord>(COLLECTION);

  if (!indexesReady) {
    indexesReady = Promise.all([
      col.createIndex({ tokenHash: 1 }, { unique: true }),
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      col.createIndex({ userId: 1 }),
    ]).then(() => undefined);
  }
  await indexesReady;

  return col;
}

function toUser(doc: RefreshTokenRecord): AuthUser {
  return {
    id: doc.userId,
    email: doc.email,
    name: doc.name,
    kind: doc.kind,
  };
}

/** Create an opaque refresh token; returns the raw value (store only the hash). */
export async function issueRefreshToken(user: AuthUser): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const now = new Date();
  const col = await collection();

  await col.insertOne({
    id: randomBytes(12).toString("hex"),
    tokenHash: hashToken(raw),
    userId: user.id,
    email: user.email,
    name: user.name,
    kind: user.kind,
    createdAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
  });

  return raw;
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  if (!raw) return;
  const col = await collection();
  await col.updateOne(
    { tokenHash: hashToken(raw), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

/**
 * Validate a refresh token and rotate it (old revoked, new issued).
 * Returns null if missing, expired, revoked, or already used.
 */
export async function rotateRefreshToken(
  raw: string,
): Promise<{ user: AuthUser; refreshToken: string } | null> {
  if (!raw) return null;

  const col = await collection();
  const now = new Date();
  const doc = await col.findOneAndUpdate(
    {
      tokenHash: hashToken(raw),
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
    },
    { $set: { revokedAt: now } },
    { returnDocument: "before" },
  );

  if (!doc) return null;

  const user = toUser(doc);
  const refreshToken = await issueRefreshToken(user);
  return { user, refreshToken };
}
