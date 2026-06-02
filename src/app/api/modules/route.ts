import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { nanoid } from "nanoid";

export async function GET() {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const rows = await db
    .select()
    .from(schema.apiModules)
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
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    sortOrder: parsed.data.sortOrder,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.apiModules).values(row);

  return NextResponse.json({ ok: true, module: row });
}
