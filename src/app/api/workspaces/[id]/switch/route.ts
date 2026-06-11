// /api/workspaces/[id]/switch
//
// "切换当前 workspace" — 实际"切"在前端(存 localStorage),
// 这里只是返回 ws 详情(给前端 store 用),避免前端再去发一次 GET
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUserFromCookie } from "@/lib/auth";
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

export async function POST(
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
