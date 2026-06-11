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
      parent_id TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      workspace_id TEXT NOT NULL DEFAULT '__pending__',
      position REAL NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS tasks_parent ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS tasks_status_position ON tasks(status, position);

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
      workspace_id TEXT NOT NULL DEFAULT '__pending__',
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
      workspace_id TEXT NOT NULL DEFAULT '__pending__',
      title TEXT NOT NULL,
      content TEXT,
      mode TEXT NOT NULL DEFAULT 'free',
      spec_template TEXT,
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS document_tasks (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      section_key TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (document_id, task_id)
    );

    CREATE INDEX IF NOT EXISTS document_tasks_doc ON document_tasks(document_id);
    CREATE INDEX IF NOT EXISTS document_tasks_task ON document_tasks(task_id);

    CREATE TABLE IF NOT EXISTS spec_interfaces (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      method TEXT NOT NULL DEFAULT 'GET',
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      request_schema TEXT,
      response_schema TEXT,
      mock_response TEXT,
      mock_status_code INTEGER NOT NULL DEFAULT 200,
      derived_task_id TEXT,
      derived_interface_id TEXT,
      position REAL NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS spec_interfaces_doc ON spec_interfaces(document_id);

    -- Workspaces(项目)— 替代旧的 project_settings 单例表
    -- 不再 seed 默认行:首次进入必须走向导新建项目
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      background TEXT NOT NULL DEFAULT '',
      goals TEXT NOT NULL DEFAULT '[]',
      non_goals TEXT NOT NULL DEFAULT '[]',
      tech_stack TEXT NOT NULL DEFAULT '[]',
      created_by_id TEXT REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS workspaces_created_by ON workspaces(created_by_id);
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

  // 迁移：给 documents 表加 mode/spec_template 列
  try { sqlite.exec(`ALTER TABLE documents ADD COLUMN mode TEXT NOT NULL DEFAULT 'free'`); } catch {}
  try { sqlite.exec(`ALTER TABLE documents ADD COLUMN spec_template TEXT`); } catch {}

  // 迁移：tasks 表加 parent_id(子任务→父任务) + tags(JSON 数组,预留 sprint)
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN parent_id TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS tasks_parent ON tasks(parent_id)`); } catch {}

  // 迁移：spec_interfaces 表(已用 CREATE TABLE 兜底,这里留空兜底 ALTER)
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS spec_interfaces_doc ON spec_interfaces(document_id)`); } catch {}

  sqlite.close();
  console.log("[migrate] schema ready at", dbPath);
}
