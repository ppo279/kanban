import { cookies } from "next/headers";
import { db, schema } from "./db";
import { eq, and, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { User } from "@/types";

const COOKIE_NAME = "sid";
const SESSION_DAYS = 7;

export async function createSession(userId: string): Promise<string> {
  const id = nanoid(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({ id, userId, expiresAt });
  return id;
}

export async function destroySession(sid: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
}

export async function getUserFromCookie(): Promise<User | null> {
  const c = await cookies();
  const sid = c.get(COOKIE_NAME)?.value;
  if (!sid) return null;

  const now = new Date();
  const row = await db
    .select({
      session: schema.sessions,
      user: schema.users,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sid), gt(schema.sessions.expiresAt, now)))
    .limit(1);

  if (row.length === 0) return null;
  const u = row[0].user;
  return {
    id: u.id,
    name: u.name,
    role: u.role as User["role"],
    createdAt: u.createdAt instanceof Date ? u.createdAt.getTime() : Number(u.createdAt),
  };
}

export async function getUserFromSid(sid: string | undefined): Promise<User | null> {
  if (!sid) return null;
  const now = new Date();
  const row = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sid), gt(schema.sessions.expiresAt, now)))
    .limit(1);
  if (row.length === 0) return null;
  const u = row[0].user;
  return {
    id: u.id,
    name: u.name,
    role: u.role as User["role"],
    createdAt: u.createdAt instanceof Date ? u.createdAt.getTime() : Number(u.createdAt),
  };
}

export const SESSION_COOKIE = COOKIE_NAME;
