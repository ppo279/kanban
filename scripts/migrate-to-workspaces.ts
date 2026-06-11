// pnpm tsx scripts/migrate-to-workspaces.ts
//
// 一次性迁移:旧单例 project_settings → 多项目 workspaces
// 同时给 tasks / documents / api_modules 加 workspace_id(从 project_settings 把所有数据
// 挂到一个默认 workspace 下,避免丢历史)
//
// 用法:先停 pnpm dev,跑这个,再重启 dev
//
// 设计:
//   1. 如果 workspaces 表已存在 → 跳过(幂等)
//   2. 创建 workspaces 表
//   3. 迁移 project_settings 单例行到 workspaces(如果存在)
//   4. 给 tasks / documents / api_modules 加 workspace_id 列(若不存在)
//   5. 旧数据挂到默认 workspace(从 project_settings 来的)
//   6. 删除 project_settings 表
//   7. 标记完成(防止重复跑)
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.DATABASE_URL ?? "./data/kanban.db";
const ABS = path.resolve(DB_PATH);

if (!fs.existsSync(ABS)) {
  console.log(`[migrate] DB 不存在: ${ABS}`);
  console.log(`[migrate] 直接启动 pnpm dev,setup.ts 会建空表。无需迁移。`);
  process.exit(0);
}

const db = new Database(ABS);
db.pragma("foreign_keys = ON");

// ── 0. 幂等检查:workspaces 是否已经有行(已迁移过) ──
const hasWorkspacesTable = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'"
  )
  .get();
if (!hasWorkspacesTable) {
  console.log("[migrate] workspaces 表不存在,开始迁移");

  // 1. 创 workspaces 表(跟 setup.ts 保持一致)
  db.exec(`
    CREATE TABLE workspaces (
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
    CREATE INDEX workspaces_created_by ON workspaces(created_by_id);
  `);
  console.log("[migrate] ✓ 创建 workspaces 表");
} else {
  console.log("[migrate] workspaces 表已存在,跳过建表");
}

// 2. 检查 project_settings 是否有数据
const hasProjectSettingsTable = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='project_settings'"
  )
  .get();

const existingWs = db.prepare("SELECT COUNT(*) as c FROM workspaces").get() as {
  c: number;
};
let defaultWsId: string | null = null;

if (existingWs.c > 0) {
  console.log(`[migrate] workspaces 已有 ${existingWs.c} 行,不需要从 project_settings 导入`);
} else if (hasProjectSettingsTable) {
  // 3. 迁移 project_settings 单例行到 workspaces
  const old = db.prepare("SELECT * FROM project_settings WHERE id = 1").get() as
    | {
        name: string;
        background: string | null;
        goals: string;
        non_goals: string;
        tech_stack: string;
        updated_by_id: string | null;
        updated_at: number;
      }
    | undefined;
  if (old) {
    // 用旧的 updated_at 当 created_at 近似
    const newId = `ws_${Math.random().toString(36).slice(2, 14)}`;
    db.prepare(
      `INSERT INTO workspaces (id, name, background, goals, non_goals, tech_stack, created_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId,
      old.name,
      old.background ?? "",
      old.goals || "[]",
      old.non_goals || "[]",
      old.tech_stack || "[]",
      old.updated_by_id,
      old.updated_at,
      old.updated_at
    );
    defaultWsId = newId;
    console.log(`[migrate] ✓ project_settings 行已迁移到 workspaces (id=${newId})`);
  } else {
    console.log("[migrate] project_settings 表存在但没行,跳过迁移");
  }
} else {
  console.log("[migrate] project_settings 表不存在,跳过迁移");
}

// 4. 给业务表加 workspace_id 列(若不存在)
function addColumnIfMissing(table: string, col: string, decl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.some((c) => c.name === col)) {
    console.log(`[migrate] ${table}.${col} 已存在,跳过`);
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${decl}`);
  console.log(`[migrate] ✓ ${table}.${col}`);
}

addColumnIfMissing("tasks", "workspace_id", "workspace_id TEXT");
addColumnIfMissing("documents", "workspace_id", "workspace_id TEXT");
addColumnIfMissing("api_modules", "workspace_id", "workspace_id TEXT");

// 5. 旧数据(没 workspaceId 的)挂到默认 workspace
if (defaultWsId) {
  const updTasks = db
    .prepare("UPDATE tasks SET workspace_id = ? WHERE workspace_id IS NULL")
    .run(defaultWsId);
  console.log(`[migrate] ✓ tasks 旧数据挂到默认 ws: ${updTasks.changes} 行`);

  const updDocs = db
    .prepare("UPDATE documents SET workspace_id = ? WHERE workspace_id IS NULL")
    .run(defaultWsId);
  console.log(`[migrate] ✓ documents 旧数据挂到默认 ws: ${updDocs.changes} 行`);

  const updMods = db
    .prepare(
      "UPDATE api_modules SET workspace_id = ? WHERE workspace_id IS NULL"
    )
    .run(defaultWsId);
  console.log(`[migrate] ✓ api_modules 旧数据挂到默认 ws: ${updMods.changes} 行`);
} else {
  // 没有默认 workspace(全新 DB 或 workspaces 已存在但没行)— 旧业务数据没法挂
  // 这种情况下,清掉所有没 workspaceId 的业务数据
  const oldTasks = db
    .prepare("DELETE FROM tasks WHERE workspace_id IS NULL")
    .run();
  console.log(`[migrate] ⚠️  清掉没 workspace 的旧 tasks: ${oldTasks.changes} 行`);
  const oldDocs = db
    .prepare("DELETE FROM documents WHERE workspace_id IS NULL")
    .run();
  console.log(`[migrate] ⚠️  清掉没 workspace 的旧 documents: ${oldDocs.changes} 行`);
  const oldMods = db
    .prepare("DELETE FROM api_modules WHERE workspace_id IS NULL")
    .run();
  console.log(`[migrate] ⚠️  清掉没 workspace 的旧 api_modules: ${oldMods.changes} 行`);
}

// 6. 删除 project_settings 单例表(已被 workspaces 替代)
if (hasProjectSettingsTable) {
  db.exec("DROP TABLE project_settings");
  console.log("[migrate] ✓ 删除 project_settings 单例表");
}

db.close();
console.log("\n[migrate] ✓ 完成。重启 pnpm dev 即可。");
