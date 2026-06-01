// 测试 setup：mock next/headers 让 cookies() 走内存 store
import { beforeAll, afterAll, vi } from "vitest";
import path from "node:path";

// 全局 cookie store
const cookieStore = new Map<string, { name: string; value: string }>();
globalThis.__cookieStore__ = cookieStore;

vi.mock("next/headers", () => ({
  async cookies() {
    return {
      get(name: string) {
        return cookieStore.get(name);
      },
      set(name: string, value: string) {
        if (typeof value === "object" && value !== null && "value" in value) {
          cookieStore.set(name, value as any);
        } else {
          cookieStore.set(name, { name, value });
        }
      },
      delete(name: string) {
        cookieStore.delete(name);
      },
    };
  },
}));

const TEST_DB = path.resolve(
  process.cwd(),
  `data/test-kanban-${Date.now()}-${process.pid}.db`
);
process.env.DATABASE_URL = TEST_DB;
process.env.DEFAULT_PASSWORD = "test1234";

beforeAll(async () => {
  const { runMigrations } = await import("../src/lib/db/setup");
  await runMigrations();
  const { seedUsers, ensureDemoTasks } = await import("../src/lib/db/seed");
  await seedUsers();
  await ensureDemoTasks();
});

afterAll(async () => {
  // best-effort 清理
});

declare global {
  // eslint-disable-next-line no-var
  var __cookieStore__: Map<string, { name: string; value: string }>;
}
