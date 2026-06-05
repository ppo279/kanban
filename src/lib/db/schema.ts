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

export type DbUser = typeof users.$inferSelect;
export type DbTask = typeof tasks.$inferSelect;
export type DbSession = typeof sessions.$inferSelect;
export type DbApiModule = typeof apiModules.$inferSelect;
export type DbApiInterface = typeof apiInterfaces.$inferSelect;
export type DbDocument = typeof documents.$inferSelect;
