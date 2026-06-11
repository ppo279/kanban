// /api/workspaces/[id]
//
// 详情 / 改 / 删 / 切当前
// 删除会触发 SQLite cascade,清掉这个 ws 下的所有 task/document/api
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUserFromCookie } from "@/lib/auth";
import { emitToBoard } from "@/lib/socket";
import type { DbWorkspace } from "@/lib/db/schema";

function serialize(w: DbWorkspace) {
  return {
    id: w.id,
    name: w.name,
    background: w.background,
    goals: w.goals ?? [],
    nonGoals: w.nonGoals ?? [],
    techStack: w.techStack ?? [],
    createdById: w.createdById,
    createdAt:
      w.createdAt instanceof Date ? w.createdAt.getTime() : Number(w.createdAt),
    updatedAt:
      w.updatedAt instanceof Date ? w.updatedAt.getTime() : Number(w.updatedAt),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id } = await params;
  const [row] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ ok: false, error: "工作区不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, workspace: serialize(row) });
}

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  background: z.string().min(1).max(5000).optional(),
  goals: z.array(z.string().min(1).max(500)).max(50).optional(),
  nonGoals: z.array(z.string().min(1).max(500)).max(50).optional(),
  techStack: z.array(z.string().min(1).max(100)).max(50).optional(),
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
    return NextResponse.json(
      { ok: false, error: "参数错误", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ ok: false, error: "没有可更新字段" }, { status: 400 });
  }

  // 校验 ws 存在
  const [existing] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "工作区不存在" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.background !== undefined) updates.background = parsed.data.background.trim();
  if (parsed.data.goals !== undefined) updates.goals = parsed.data.goals;
  if (parsed.data.nonGoals !== undefined) updates.nonGoals = parsed.data.nonGoals;
  if (parsed.data.techStack !== undefined) updates.techStack = parsed.data.techStack;

  await db
    .update(schema.workspaces)
    .set(updates)
    .where(eq(schema.workspaces.id, id));

  // 广播 workspace:updated 让前端 store 拉新数据
  emitToBoard("workspace:updated", { id });

  const [updated] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, id))
    .limit(1);

  return NextResponse.json({ ok: true, workspace: serialize(updated) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "工作区不存在" }, { status: 404 });
  }

  // SQLite CASCADE 自动清掉 task/document/api
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, id));

  emitToBoard("workspace:deleted", { id });

  return NextResponse.json({ ok: true });
}
