import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role", { enum: ["frontend", "backend", "testing"] }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["todo", "doing", "review", "done"] })
    .notNull()
    .default("todo"),
  priority: text("priority", { enum: ["low", "med", "high"] })
    .notNull()
    .default("med"),
  type: text("type", { enum: ["feature", "bug", "mock-api", "doc"] })
    .notNull()
    .default("feature"),
  assigneeId: text("assignee_id")
    .notNull()
    .references(() => users.id),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  // 父任务 id — 子任务通过这个字段指向父任务,父任务可以有任意个子任务
  // UI 软限 2 层(parent 的 parent 不允许),DB 不强约束
  parentId: text("parent_id"),
  // 标签 — 暂时不实现 UI(为将来 sprint 预留),先存着
  // 用 JSON 数组形式,SQLite 端就是 text
  tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
  position: real("position").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const apiModules = sqliteTable("api_modules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  responseWrapper: text("response_wrapper"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const apiInterfaces = sqliteTable("api_interfaces", {
  id: text("id").primaryKey(),
  moduleId: text("module_id")
    .notNull()
    .references(() => apiModules.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  method: text("method", { enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] })
    .notNull()
    .default("GET"),
  path: text("path").notNull(),
  description: text("description"),
  requestSchema: text("request_schema"),
  responseSchema: text("response_schema"),
  mockResponse: text("mock_response"),
  mockStatusCode: integer("mock_status_code").notNull().default(200),
  requestFields: text("request_fields"),
  mockFields: text("mock_fields"),
  responseMode: text("response_mode", { enum: ["inherit", "custom", "raw"] }).notNull().default("inherit"),
  customWrapper: text("custom_wrapper"),
  mockHeaders: text("mock_headers"),
  swaggerUrl: text("swagger_url"),
  status: text("status", { enum: ["draft", "active", "deprecated"] })
    .notNull()
    .default("draft"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  mode: text("mode", { enum: ["free", "spec", "tdd"] })
    .notNull()
    .default("free"),
  specTemplate: text("spec_template"),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * spec 文档的结构化接口设计
 *
 * 跟 markdown 的"接口设计"section 是 1:1 — 那个 section 不再是纯文本,
 * 这里是结构化数据(可以一键转 mock,反向链接 task 等)
 */
export const specInterfaces = sqliteTable("spec_interfaces", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  method: text("method", { enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] })
    .notNull()
    .default("GET"),
  path: text("path").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  requestSchema: text("request_schema"),
  responseSchema: text("response_schema"),
  mockResponse: text("mock_response"),
  mockStatusCode: integer("mock_status_code").notNull().default(200),
  // 关联:这个 spec_interface 已经被转成了哪个 mock-api 任务
  // (nullable,转了一次后置上,避免重复转)
  derivedTaskId: text("derived_task_id"),
  derivedInterfaceId: text("derived_interface_id"),
  position: real("position").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const documentTasks = sqliteTable("document_tasks", {
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  sectionKey: text("section_key"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * 项目设置 — 单例表
 *
 * 单项目多人协作平台用,只有一行 (id=1)。字段:
 *   - name:项目名(展示用,任意 3 人都能改)
 *   - background:项目背景/介绍 — 自由文本,留项目元信息
 *   - goals:string[] — 项目目标(结构化,适合后续给 AI 当 context)
 *   - nonGoals:string[] — 明确不做的事(防 scope creep,适合给 AI 提示)
 *   - techStack:string[] — 技术栈标签(展示 + 筛选,后端不强校验)
 *   - updatedAt / updatedById:谁最后改的
 *
 * 设计选择:
 *   - 单例用 PRIMARY KEY CHECK (id = 1) 约束,避免误插多行
 *   - tags / 数组用 SQLite JSON 模式 (mode: "json"),跟 tasks.tags 保持一致
 *   - 暂时不引入 workspace 概念(单项目),未来要拆多项目时把 id 改成 nanoid + 删 CHECK 即可
 */
export const projectSettings = sqliteTable("project_settings", {
  id: integer("id").primaryKey(),
  name: text("name").notNull().default("kanban"),
  background: text("background"),
  // 结构化数组用 SQLite JSON 模式 — 跟 tasks.tags 一样
  goals: text("goals", { mode: "json" }).$type<string[]>().default([]),
  nonGoals: text("non_goals", { mode: "json" }).$type<string[]>().default([]),
  techStack: text("tech_stack", { mode: "json" }).$type<string[]>().default([]),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedById: text("updated_by_id").references(() => users.id),
});

export type DbUser = typeof users.$inferSelect;
export type DbTask = typeof tasks.$inferSelect;
export type DbSession = typeof sessions.$inferSelect;
export type DbApiModule = typeof apiModules.$inferSelect;
export type DbApiInterface = typeof apiInterfaces.$inferSelect;
export type DbDocument = typeof documents.$inferSelect;
export type DbDocumentTask = typeof documentTasks.$inferSelect;
export type DbSpecInterface = typeof specInterfaces.$inferSelect;
export type DbProjectSettings = typeof projectSettings.$inferSelect;
