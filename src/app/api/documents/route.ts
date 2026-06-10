import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getUserFromCookie } from "@/lib/auth";
import { nanoid } from "nanoid";
import { like, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  // 不传 q 走原逻辑(全量)
  // 传 q 走 title LIKE 模糊匹配 — 用来给 TaskDetailDialog 搜文档关联候选
  let query = db.select().from(schema.documents).$dynamic();
  if (q) {
    query = query.where(like(schema.documents.title, `%${q}%`));
  }
  const rows = await query.orderBy(schema.documents.updatedAt);

  return NextResponse.json({
    ok: true,
    documents: rows.map((r) => ({
      id: r.id,
      title: r.title,
      mode: r.mode,
      createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.getTime() : Number(r.updatedAt),
    })),
  });
}



const CreateBody = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(100000).nullable().optional(),
  mode: z.enum(["free", "spec", "tdd"]).optional(),
  specTemplate: z.string().max(20000).nullable().optional(),
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
    mode: parsed.data.mode ?? "free",
    specTemplate: parsed.data.specTemplate ?? null,
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
