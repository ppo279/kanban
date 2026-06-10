// GET    /api/spec-interfaces/[id]
// PATCH  /api/spec-interfaces/[id]
// DELETE /api/spec-interfaces/[id]
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id } = await params;
  const [row] = await db
    .select()
    .from(schema.specInterfaces)
    .where(eq(schema.specInterfaces.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ ok: false, error: "接口定义不存在" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    interface: {
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : Number(row.updatedAt),
    },
  });
}

const PatchBody = z.object({
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional(),
  path: z.string().min(1).max(500).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  requestSchema: z.string().max(10000).nullable().optional(),
  responseSchema: z.string().max(10000).nullable().optional(),
  mockResponse: z.string().max(10000).nullable().optional(),
  mockStatusCode: z.number().int().min(100).max(599).optional(),
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
    return NextResponse.json(
      { ok: false, error: "参数错误", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ ok: false, error: "没有可更新字段" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(schema.specInterfaces)
    .where(eq(schema.specInterfaces.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "接口定义不存在" }, { status: 404 });
  }

  // 如果 spec_interface 已经被转成 mock 了,某些字段(尤其是 method/path)就不能瞎改
  // — 否则 mock 跟 spec 对不上。简单处理:已转 mock 的只允许改 name/description
  if (existing.derivedInterfaceId) {
    const allowed = new Set(["name", "description", "mockResponse", "mockStatusCode"]);
    for (const k of Object.keys(parsed.data)) {
      if (!allowed.has(k)) {
        return NextResponse.json(
          {
            ok: false,
            error: `该接口已生成 mock,字段「${k}」不能修改(method/path 已被 mock 占用)`,
          },
          { status: 400 }
        );
      }
    }
  }

  const updates = { ...parsed.data, updatedAt: new Date() };
  await db
    .update(schema.specInterfaces)
    .set(updates)
    .where(eq(schema.specInterfaces.id, id));

  const [updated] = await db
    .select()
    .from(schema.specInterfaces)
    .where(eq(schema.specInterfaces.id, id))
    .limit(1);
  return NextResponse.json({
    ok: true,
    interface: {
      ...updated,
      createdAt:
        updated.createdAt instanceof Date
          ? updated.createdAt.getTime()
          : Number(updated.createdAt),
      updatedAt:
        updated.updatedAt instanceof Date
          ? updated.updatedAt.getTime()
          : Number(updated.updatedAt),
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
  // 如果已经被转 mock,不让删(避免悬空引用)
  const [existing] = await db
    .select()
    .from(schema.specInterfaces)
    .where(eq(schema.specInterfaces.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "接口定义不存在" }, { status: 404 });
  }
  if (existing.derivedInterfaceId) {
    return NextResponse.json(
      {
        ok: false,
        error: "该接口已生成 mock,不能删除(先删除对应的 mock-api 任务)",
      },
      { status: 400 }
    );
  }

  await db
    .delete(schema.specInterfaces)
    .where(eq(schema.specInterfaces.id, id));
  return NextResponse.json({ ok: true });
}
