// GET /api/spec-interfaces?documentId=xxx
// POST /api/spec-interfaces
//
// 列出/创建文档的结构化接口定义(spec 模式「接口设计」section 用)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { newPosition } from "@/lib/fractional";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "缺少 documentId" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(schema.specInterfaces)
    .where(eq(schema.specInterfaces.documentId, documentId))
    .orderBy(schema.specInterfaces.position);

  return NextResponse.json({
    ok: true,
    interfaces: rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      method: r.method,
      path: r.path,
      name: r.name,
      description: r.description,
      requestSchema: r.requestSchema,
      responseSchema: r.responseSchema,
      mockResponse: r.mockResponse,
      mockStatusCode: r.mockStatusCode,
      derivedTaskId: r.derivedTaskId,
      derivedInterfaceId: r.derivedInterfaceId,
      position: r.position,
      createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.getTime() : Number(r.updatedAt),
    })),
  });
}

const CreateBody = z.object({
  documentId: z.string().min(1).max(64),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  requestSchema: z.string().max(10000).nullable().optional(),
  responseSchema: z.string().max(10000).nullable().optional(),
  mockResponse: z.string().max(10000).nullable().optional(),
  mockStatusCode: z.number().int().min(100).max(599).default(200),
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

  // 校验 doc 存在
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, parsed.data.documentId))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "文档不存在" }, { status: 404 });
  }

  const id = nanoid(12);
  const now = Date.now();
  const row = {
    id,
    documentId: parsed.data.documentId,
    method: parsed.data.method,
    path: parsed.data.path,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    requestSchema: parsed.data.requestSchema ?? null,
    responseSchema: parsed.data.responseSchema ?? null,
    mockResponse: parsed.data.mockResponse ?? null,
    mockStatusCode: parsed.data.mockStatusCode,
    derivedTaskId: null,
    derivedInterfaceId: null,
    position: newPosition(),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.specInterfaces).values(row);

  return NextResponse.json({
    ok: true,
    interface: {
      ...row,
      createdAt: now,
      updatedAt: now,
    },
  });
}
