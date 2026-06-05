// 启动时自动跑建表
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export async function runMigrations() {
  const dbPath = process.env.DATABASE_URL ?? "./data/kanban.db";
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'med',
      type TEXT NOT NULL DEFAULT 'feature',
      assignee_id TEXT NOT NULL REFERENCES users(id),
      created_by_id TEXT NOT NULL REFERENCES users(id),
      position REAL NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS tasks_status_position ON tasks(status, position);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS api_modules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      response_wrapper TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS api_interfaces (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL REFERENCES api_modules(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET',
      path TEXT NOT NULL,
      description TEXT,
      request_schema TEXT,
      response_schema TEXT,
      mock_response TEXT,
      mock_status_code INTEGER NOT NULL DEFAULT 200,
      request_fields TEXT,
      mock_fields TEXT,
      response_mode TEXT NOT NULL DEFAULT 'inherit',
      custom_wrapper TEXT,
      mock_headers TEXT,
      swagger_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);

  // 迁移：给 tasks 表添加 type 列（如果不存在）
  try {
    sqlite.exec(`ALTER TABLE tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'feature'`);
  } catch {
    // 列已存在，忽略
  }

  // 迁移：给 api_interfaces 表添加新列
  try { sqlite.exec(`ALTER TABLE api_interfaces ADD COLUMN mock_fields TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE api_interfaces ADD COLUMN request_fields TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE api_interfaces ADD COLUMN response_mode TEXT NOT NULL DEFAULT 'inherit'`); } catch {}
  try { sqlite.exec(`ALTER TABLE api_interfaces ADD COLUMN custom_wrapper TEXT`); } catch {}

  // 迁移：给 api_modules 表添加 response_wrapper 列
  try { sqlite.exec(`ALTER TABLE api_modules ADD COLUMN response_wrapper TEXT`); } catch {}

  sqlite.close();
  console.log("[migrate] schema ready at", dbPath);
}
