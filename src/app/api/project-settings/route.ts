// /api/project-settings
//
// 单例项目设置(单项目平台用,只有一行 id=1)
// 任意登录用户都能读 + 改(没有 admin 角色概念,3 人平等)
//
// GET    /api/project-settings     → { ok, settings: {...} }
// PATCH  /api/project-settings     body: Partial<{name,background,goals,nonGoals,techStack}>
//                                   → { ok, settings: {...} }
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUserFromCookie } from "@/lib/auth";
import type { DbProjectSettings } from "@/lib/db/schema";

/** 序列化:Date / number 统一转 number(ms)给前端 */
function serialize(s: DbProjectSettings) {
  return {
    name: s.name,
    background: s.background,
    goals: s.goals ?? [],
    nonGoals: s.nonGoals ?? [],
    techStack: s.techStack ?? [],
    updatedAt:
      s.updatedAt instanceof Date ? s.updatedAt.getTime() : Number(s.updatedAt),
    updatedById: s.updatedById ?? null,
  };
}

export async function GET() {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const [row] = await db
    .select()
    .from(schema.projectSettings)
    .where(eq(schema.projectSettings.id, 1))
    .limit(1);
  if (!row) {
    // 极端兜底:setup.ts 应该已经 seed 过了,这里再插一次
    await db.insert(schema.projectSettings).values({ id: 1, name: "kanban" });
    return NextResponse.json({
      ok: true,
      settings: { name: "kanban", background: null, goals: [], nonGoals: [], techStack: [], updatedAt: Date.now(), updatedById: null },
    });
  }
  return NextResponse.json({ ok: true, settings: serialize(row) });
}

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  background: z.string().max(5000).nullable().optional(),
  goals: z.array(z.string().min(1).max(500)).max(50).optional(),
  nonGoals: z.array(z.string().min(1).max(500)).max(50).optional(),
  techStack: z.array(z.string().min(1).max(100)).max(50).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

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

  // 数组字段:未传 = 不动;传了空数组 = 清空
  // 字符串字段:未传 = 不动;传 null = 清空
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedById: user.id,
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.background !== undefined) updates.background = parsed.data.background;
  if (parsed.data.goals !== undefined) updates.goals = parsed.data.goals;
  if (parsed.data.nonGoals !== undefined) updates.nonGoals = parsed.data.nonGoals;
  if (parsed.data.techStack !== undefined) updates.techStack = parsed.data.techStack;

  await db
    .update(schema.projectSettings)
    .set(updates)
    .where(eq(schema.projectSettings.id, 1));

  const [updated] = await db
    .select()
    .from(schema.projectSettings)
    .where(eq(schema.projectSettings.id, 1))
    .limit(1);

  return NextResponse.json({ ok: true, settings: serialize(updated) });
}
