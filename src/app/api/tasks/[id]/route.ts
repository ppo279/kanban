import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { toApiTask } from "@/lib/util";
import { emitToBoard } from "@/lib/socket";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(["low", "med", "high"]).optional(),
  type: z.enum(["feature", "bug", "mock-api", "doc"]).optional(),
  assigneeId: z.string().min(1).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "参数错误" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ ok: false, error: "没有可更新字段" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, id))
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ ok: false, error: "任务不存在" }, { status: 404 });
  }
  // 权限：仅创建者或被指派人可编辑
  const t = existing[0];
  if (t.createdById !== user.id && t.assigneeId !== user.id) {
    return NextResponse.json({ ok: false, error: "无权编辑此任务" }, { status: 403 });
  }

  // 多项目防御：query 带 ?workspaceId= 必须跟 task.workspaceId 一致
  // 防止别 ws 的 task id 被当 URL 误改
  const urlWorkspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (urlWorkspaceId && urlWorkspaceId !== t.workspaceId) {
    return NextResponse.json(
      { ok: false, error: "任务不在该工作区" },
      { status: 403 }
    );
  }

  const updates = { ...parsed.data, updatedAt: new Date() };
  await db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, id));

  const updated = (await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, id))
    .limit(1))[0];

  const apiTask = toApiTask(updated);
  emitToBoard("task:updated", apiTask);
  return NextResponse.json({ ok: true, task: apiTask });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id } = await params;
  const existing = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, id))
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ ok: false, error: "任务不存在" }, { status: 404 });
  }
  const t = existing[0];
  if (t.createdById !== user.id && t.assigneeId !== user.id) {
    return NextResponse.json({ ok: false, error: "无权删除此任务" }, { status: 403 });
  }
  // 多项目防御：query 带 ?workspaceId= 必须跟 task.workspaceId 一致
  const urlWorkspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (urlWorkspaceId && urlWorkspaceId !== t.workspaceId) {
    return NextResponse.json(
      { ok: false, error: "任务不在该工作区" },
      { status: 403 }
    );
  }
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  emitToBoard("task:deleted", { id });
  return NextResponse.json({ ok: true });
}
