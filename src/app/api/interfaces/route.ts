import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const moduleId = searchParams.get("moduleId");
  const taskId = searchParams.get("taskId");

  let rows;
  if (taskId) {
    rows = await db
      .select()
      .from(schema.apiInterfaces)
      .where(eq(schema.apiInterfaces.taskId, taskId))
      .orderBy(schema.apiInterfaces.path);
  } else if (moduleId) {
    rows = await db
      .select()
      .from(schema.apiInterfaces)
      .where(eq(schema.apiInterfaces.moduleId, moduleId))
      .orderBy(schema.apiInterfaces.path);
  } else {
    rows = await db
      .select()
      .from(schema.apiInterfaces)
      .orderBy(schema.apiInterfaces.path);
  }

  return NextResponse.json({ ok: true, interfaces: rows });
}

const CreateBody = z.object({
  moduleId: z.string().min(1),
  taskId: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
  path: z.string().min(1).max(500),
  description: z.string().max(2000).nullable().optional(),
  requestSchema: z.string().max(10000).nullable().optional(),
  responseSchema: z.string().max(10000).nullable().optional(),
  mockResponse: z.string().max(50000).nullable().optional(),
  mockStatusCode: z.number().int().min(100).max(599).default(200),
  mockHeaders: z.string().max(5000).nullable().optional(),
  swaggerUrl: z.string().url().nullable().optional(),
  status: z.enum(["draft", "active", "deprecated"]).default("draft"),
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

  // 验证模块存在
  const mod = await db
    .select()
    .from(schema.apiModules)
    .where(eq(schema.apiModules.id, parsed.data.moduleId))
    .limit(1);
  if (mod.length === 0) {
    return NextResponse.json({ ok: false, error: "模块不存在" }, { status: 404 });
  }

  const now = Date.now();
  const row = {
    id: nanoid(12),
    moduleId: parsed.data.moduleId,
    taskId: parsed.data.taskId ?? null,
    name: parsed.data.name,
    method: parsed.data.method,
    path: parsed.data.path,
    description: parsed.data.description ?? null,
    requestSchema: parsed.data.requestSchema ?? null,
    responseSchema: parsed.data.responseSchema ?? null,
    mockResponse: parsed.data.mockResponse ?? null,
    mockStatusCode: parsed.data.mockStatusCode,
    mockHeaders: parsed.data.mockHeaders ?? null,
    swaggerUrl: parsed.data.swaggerUrl ?? null,
    status: parsed.data.status,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.apiInterfaces).values(row);

  return NextResponse.json({ ok: true, interface: row });
}
