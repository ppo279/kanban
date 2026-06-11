import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { toApiTask } from "@/lib/util";
import { newPosition } from "@/lib/fractional";
import { emitToBoard } from "@/lib/socket";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  // 必传 ?workspaceId= —— 平台支持多项目,列表必须按当前 ws 过滤
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json(
      { ok: false, error: "缺少 workspaceId" },
      { status: 400 }
    );
  }
  // 校验 ws 存在(防止 404/越权之间模糊)
  const [ws] = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  if (!ws) {
    return NextResponse.json(
      { ok: false, error: "工作区不存在" },
      { status: 404 }
    );
  }

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.workspaceId, workspaceId))
    .orderBy(schema.tasks.status, schema.tasks.position);
  return NextResponse.json({ ok: true, tasks: rows.map(toApiTask) });
}

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(["low", "med", "high"]).default("med"),
  type: z.enum(["feature", "bug", "mock-api", "doc"]).default("feature"),
  assigneeId: z.string().min(1),
  status: z.enum(["todo", "doing", "review", "done"]).default("todo"),
  /** 父任务 id — 软限 2 层(创建时不强制检查,留给 UI 限制) */
  parentId: z.string().min(1).max(64).nullable().optional(),
  /** 标签数组 — 现在没 UI 消费,但存着 */
  tags: z.array(z.string().min(1).max(50)).max(20).optional().default([]),
  /** 必传,任务归属 ws */
  workspaceId: z.string().min(1).max(64),
});

export async function POST(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "参数错误", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Fall back to current user if assigneeId is empty
  const assigneeId = parsed.data.assigneeId || user.id;

  // 校验目标 workspace 存在
  const [ws] = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, parsed.data.workspaceId))
    .limit(1);
  if (!ws) {
    return NextResponse.json(
      { ok: false, error: "工作区不存在" },
      { status: 404 }
    );
  }

  // 软限 2 层:父任务不能有 parentId(避免 parent → parent → parent)
  // 父任务必须跟新任务在同一个 workspace —— 跨 ws 不能建父子关系
  if (parsed.data.parentId) {
    const [parent] = await db
      .select({
        parentId: schema.tasks.parentId,
        workspaceId: schema.tasks.workspaceId,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, parsed.data.parentId))
      .limit(1);
    if (!parent) {
      return NextResponse.json({ ok: false, error: "父任务不存在" }, { status: 404 });
    }
    if (parent.workspaceId !== parsed.data.workspaceId) {
      return NextResponse.json(
        { ok: false, error: "父任务必须在同一个工作区" },
        { status: 400 }
      );
    }
    if (parent.parentId) {
      return NextResponse.json(
        { ok: false, error: "不支持 3 层嵌套(父任务已经有上级了)" },
        { status: 400 }
      );
    }
  }

  const id = nanoid(12);
  const now = Date.now();
  const row = {
    id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    status: parsed.data.status,
    priority: parsed.data.priority,
    type: parsed.data.type,
    assigneeId,
    createdById: user.id,
    parentId: parsed.data.parentId ?? null,
    // drizzle 的 mode: "json" 会自动 stringify,直接传 string[] 就行
    tags: parsed.data.tags ?? [],
    workspaceId: parsed.data.workspaceId,
    position: newPosition(),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.tasks).values(row);

  const apiTask = toApiTask(row);
  emitToBoard("task:created", apiTask);

  // 如果有父任务,触发 rollup(子任务可能默认是 todo,但万一)
  if (parsed.data.parentId) {
    const { recomputeAncestors } = await import("@/lib/taskTree");
    await recomputeAncestors(id);
  }

  return NextResponse.json({ ok: true, task: apiTask });
}
