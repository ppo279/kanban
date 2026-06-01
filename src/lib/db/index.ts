import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.env.DATABASE_URL ?? "./data/kanban.db";

// 确保 data 目录存在
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// 防止在 dev 模式下热重载时重复创建连接
const globalForDb = globalThis as unknown as {
  __sqlite__?: Database.Database;
};

const sqlite = globalForDb.__sqlite__ ?? new Database(dbPath);
if (!globalForDb.__sqlite__) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  globalForDb.__sqlite__ = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { schema };
export type DB = typeof db;
