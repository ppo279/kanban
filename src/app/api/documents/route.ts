import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getUserFromCookie } from "@/lib/auth";
import { nanoid } from "nanoid";

export async function GET() {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const rows = await db
    .select()
    .from(schema.documents)
    .orderBy(schema.documents.updatedAt);

  return NextResponse.json({
    ok: true,
    documents: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.getTime() : Number(r.updatedAt),
    })),
  });
}

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(100000).nullable().optional(),
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
    return NextResponse.json({ ok: false, error: "参数错误" }, { status: 400 });
  }

  const now = Date.now();
  const row = {
    id: nanoid(12),
    title: parsed.data.title,
    content: parsed.data.content ?? "",
    createdById: user.id,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.documents).values(row);

  return NextResponse.json({
    ok: true,
    document: {
      ...row,
      createdAt: now,
      updatedAt: now,
    },
  });
}
