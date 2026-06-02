import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";

const PatchBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().optional(),
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
    .from(schema.apiModules)
    .where(eq(schema.apiModules.id, id))
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ ok: false, error: "模块不存在" }, { status: 404 });
  }

  const updates = { ...parsed.data, updatedAt: new Date() };
  await db.update(schema.apiModules).set(updates).where(eq(schema.apiModules.id, id));

  const updated = (await db
    .select()
    .from(schema.apiModules)
    .where(eq(schema.apiModules.id, id))
    .limit(1))[0];

  return NextResponse.json({ ok: true, module: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id } = await params;
  const existing = await db
    .select()
    .from(schema.apiModules)
    .where(eq(schema.apiModules.id, id))
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ ok: false, error: "模块不存在" }, { status: 404 });
  }

  await db.delete(schema.apiModules).where(eq(schema.apiModules.id, id));
  return NextResponse.json({ ok: true });
}
