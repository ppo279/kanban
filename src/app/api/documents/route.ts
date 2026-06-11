import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getUserFromCookie } from "@/lib/auth";
import { nanoid } from "nanoid";
import { and, eq, like, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  // 必传 ?workspaceId= —— 文档按 ws 隔离
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json(
      { ok: false, error: "缺少 workspaceId" },
      { status: 400 }
    );
  }
  // 校验 ws 存在
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

  // 始终按 workspaceId 过滤;q 模糊搜只在该 ws 范围内
  let query = db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.workspaceId, workspaceId))
    .$dynamic();
  if (q) {
    query = query.where(
      and(
        eq(schema.documents.workspaceId, workspaceId),
        like(schema.documents.title, `%${q}%`)
      )
    );
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
  /** 必传,文档归属 ws */
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

  // 校验 ws 存在
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

  const now = Date.now();
  const row = {
    id: nanoid(12),
    workspaceId: parsed.data.workspaceId,
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
