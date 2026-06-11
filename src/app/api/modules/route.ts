import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  // 必传 ?workspaceId= —— api module 按 ws 隔离
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json(
      { ok: false, error: "缺少 workspaceId" },
      { status: 400 }
    );
  }

  const rows = await db
    .select()
    .from(schema.apiModules)
    .where(eq(schema.apiModules.workspaceId, workspaceId))
    .orderBy(schema.apiModules.sortOrder);

  // 获取每个模块下的接口数量
  const modules = await Promise.all(
    rows.map(async (m) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.apiInterfaces)
        .where(eq(schema.apiInterfaces.moduleId, m.id));
      return { ...m, interfaceCount: count };
    })
  );

  return NextResponse.json({ ok: true, modules });
}

const CreateBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().default(0),
  /** 必传,模块归属 ws */
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
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    sortOrder: parsed.data.sortOrder,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.apiModules).values(row);

  return NextResponse.json({ ok: true, module: row });
}
