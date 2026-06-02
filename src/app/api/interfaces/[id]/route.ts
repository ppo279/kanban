import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { emitToBoard } from "@/lib/socket";

const PatchBody = z.object({
  moduleId: z.string().min(1).optional(),
  taskId: z.string().nullable().optional(),
  name: z.string().min(1).max(200).optional(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional(),
  path: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).nullable().optional(),
  requestSchema: z.string().max(10000).nullable().optional(),
  responseSchema: z.string().max(10000).nullable().optional(),
  mockResponse: z.string().max(50000).nullable().optional(),
  mockStatusCode: z.number().int().min(100).max(599).optional(),
  mockHeaders: z.string().max(5000).nullable().optional(),
  swaggerUrl: z.string().url().nullable().optional(),
  status: z.enum(["draft", "active", "deprecated"]).optional(),
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
    .from(schema.apiInterfaces)
    .where(eq(schema.apiInterfaces.id, id))
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ ok: false, error: "接口不存在" }, { status: 404 });
  }

  const updates = { ...parsed.data, updatedAt: new Date() };
  await db.update(schema.apiInterfaces).set(updates).where(eq(schema.apiInterfaces.id, id));

  const updated = (await db
    .select()
    .from(schema.apiInterfaces)
    .where(eq(schema.apiInterfaces.id, id))
    .limit(1))[0];

  emitToBoard("interface:updated", updated);
  return NextResponse.json({ ok: true, interface: updated });
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
    .from(schema.apiInterfaces)
    .where(eq(schema.apiInterfaces.id, id))
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ ok: false, error: "接口不存在" }, { status: 404 });
  }

  await db.delete(schema.apiInterfaces).where(eq(schema.apiInterfaces.id, id));
  emitToBoard("interface:deleted", { id });
  return NextResponse.json({ ok: true });
}
