// /api/workspaces
//
// 平台多项目 / 工作区管理
// 任何登录用户都能新建 / 编辑 / 删除(3 人平等)
// 列表 + 单个查询 + 切当前 ws(给前端轮 4 store 用)
//
// GET    /api/workspaces                       → 列表
// POST   /api/workspaces                       → 新建
// GET    /api/workspaces/:id                   → 详情
// PATCH  /api/workspaces/:id                   → 改
// DELETE /api/workspaces/:id                   → 删(级联清掉 task/document/api)
//
// 切当前 workspace(给前端 store 用,只是返回 ws,实际切状态在 localStorage):
// POST   /api/workspaces/:id/switch            → { workspace, previousId }
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUserFromCookie } from "@/lib/auth";
import { nanoid } from "nanoid";
import type { DbWorkspace } from "@/lib/db/schema";

/** 序列化:Date / number 统一转 number(ms)给前端 */
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

export async function GET() {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const rows = await db
    .select()
    .from(schema.workspaces)
    .orderBy(schema.workspaces.createdAt);

  return NextResponse.json({
    ok: true,
    workspaces: rows.map(serialize),
  });
}

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  /** 背景必填(向导第 2 步) */
  background: z.string().min(1).max(5000),
  goals: z.array(z.string().min(1).max(500)).max(50).default([]),
  nonGoals: z.array(z.string().min(1).max(500)).max(50).default([]),
  techStack: z.array(z.string().min(1).max(100)).max(50).default([]),
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

  const id = `ws_${nanoid(10)}`;
  const now = Date.now();
  const row = {
    id,
    name: parsed.data.name.trim(),
    background: parsed.data.background.trim(),
    goals: parsed.data.goals,
    nonGoals: parsed.data.nonGoals,
    techStack: parsed.data.techStack,
    createdById: user.id,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.workspaces).values(row);

  return NextResponse.json({ ok: true, workspace: serialize(row) });
}
