import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(100000).nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id } = await params;
  const rows = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, id))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "文档不存在" }, { status: 404 });
  }

  const doc = rows[0];
  return NextResponse.json({
    ok: true,
    document: {
      ...doc,
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.getTime() : Number(doc.createdAt),
      updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : Number(doc.updatedAt),
    },
  });
}

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
    .from(schema.documents)
    .where(eq(schema.documents.id, id))
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ ok: false, error: "文档不存在" }, { status: 404 });
  }

  const updates = { ...parsed.data, updatedAt: new Date() };
  await db.update(schema.documents).set(updates).where(eq(schema.documents.id, id));

  const updated = (await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, id))
    .limit(1))[0];

  return NextResponse.json({
    ok: true,
    document: {
      ...updated,
      createdAt: updated.createdAt instanceof Date ? updated.createdAt.getTime() : Number(updated.createdAt),
      updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.getTime() : Number(updated.updatedAt),
    },
  });
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
    .from(schema.documents)
    .where(eq(schema.documents.id, id))
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ ok: false, error: "文档不存在" }, { status: 404 });
  }

  await db.delete(schema.documents).where(eq(schema.documents.id, id));
  return NextResponse.json({ ok: true });
}
