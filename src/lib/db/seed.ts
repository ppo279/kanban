import { db, schema } from "./index";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const DEFAULT_USERS: Array<{
  id: string;
  name: string;
  role: "frontend" | "backend" | "testing";
}> = [
  { id: "u_frontend", name: "前端工程师", role: "frontend" },
  { id: "u_backend", name: "后端工程师", role: "backend" },
  { id: "u_testing", name: "测试工程师", role: "testing" },
];

/** demo workspace 的固定 id(只在 demo 场景用,生产用 nanoid) */
export const DEMO_WORKSPACE_ID = "ws_demo";

export async function seedUsers() {
  const password = process.env.DEFAULT_PASSWORD ?? "kanban123";
  const hash = await bcrypt.hash(password, 10);

  let created = 0;
  for (const u of DEFAULT_USERS) {
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, u.id));
    if (existing.length === 0) {
      await db.insert(schema.users).values({
        id: u.id,
        name: u.name,
        role: u.role,
        passwordHash: hash,
      });
      created++;
    }
  }
  if (created > 0) {
    console.log(
      `[seed] inserted ${created} user(s); default password = "${password}"`
    );
  }
  return { password, created };
}

/** 兜底建 demo workspace(id 固定),给 demo 任务挂在下面
 *  不会覆盖已有 workspace — 用 INSERT OR IGNORE
 */
async function ensureDemoWorkspace() {
  const existing = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, DEMO_WORKSPACE_ID));
  if (existing.length === 0) {
    await db.insert(schema.workspaces).values({
      id: DEMO_WORKSPACE_ID,
      name: "kanban (demo)",
      background: "3 人小队的多人协作平台 demo workspace,含 8 个演示任务。",
      goals: ["支持 3 人实时协作", "降低沟通成本"],
      nonGoals: ["不做权限系统"],
      techStack: ["Next.js", "Tiptap", "Yjs", "Drizzle"],
      createdById: "u_backend",
    });
    console.log(`[seed] inserted demo workspace (${DEMO_WORKSPACE_ID})`);
  }
}

export async function ensureDemoTasks() {
  const existing = await db.select().from(schema.tasks);
  if (existing.length > 0) return;

  await ensureDemoWorkspace();

  const now = Date.now();
  const step = 1000 * 1000; // 1e6, 拉得开间距
  const demoTasks = [
    {
      title: "搭建项目脚手架（Next.js + Drizzle）",
      status: "done" as const,
      priority: "high" as const,
      assigneeId: "u_backend",
      createdById: "u_backend",
      description: "已完成：Next.js 15、TS、Drizzle、SQLite、Socket.IO 接入",
    },
    {
      title: "设计 4 列看板 UI（Tailwind + shadcn）",
      status: "doing" as const,
      priority: "high" as const,
      assigneeId: "u_frontend",
      createdById: "u_backend",
      description: "看板 4 列（Todo/Doing/Review/Done），任务卡含优先级色条",
    },
    {
      title: "实现拖拽排序（@dnd-kit）",
      status: "todo" as const,
      priority: "med" as const,
      assigneeId: "u_frontend",
      createdById: "u_frontend",
    },
    {
      title: "登录认证 + Cookie session",
      status: "done" as const,
      priority: "high" as const,
      assigneeId: "u_backend",
      createdById: "u_backend",
    },
    {
      title: "Socket.IO 实时广播（拖动即同步）",
      status: "doing" as const,
      priority: "high" as const,
      assigneeId: "u_backend",
      createdById: "u_backend",
    },
    {
      title: "写 Vitest 接口测试",
      status: "todo" as const,
      priority: "med" as const,
      assigneeId: "u_testing",
      createdById: "u_testing",
    },
    {
      title: "3 人同操冒烟测试",
      status: "review" as const,
      priority: "low" as const,
      assigneeId: "u_testing",
      createdById: "u_frontend",
      description: "3 个浏览器同时操作，验证实时同步和无冲突",
    },
    {
      title: "LAN 部署文档（防火墙 + IP）",
      status: "todo" as const,
      priority: "low" as const,
      assigneeId: "u_testing",
      createdById: "u_backend",
    },
  ];

  let pos = now;
  for (const t of demoTasks) {
    await db.insert(schema.tasks).values({
      id: nanoid(12),
      title: t.title,
      description: t.description ?? null,
      status: t.status,
      priority: t.priority,
      assigneeId: t.assigneeId,
      createdById: t.createdById,
      workspaceId: DEMO_WORKSPACE_ID,
      position: pos,
    });
    pos += step;
  }
  console.log(`[seed] inserted ${demoTasks.length} demo tasks`);
}
