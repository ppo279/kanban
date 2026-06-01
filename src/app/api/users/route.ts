// 返回所有用户（用于指派下拉框）
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getUserFromCookie } from "@/lib/auth";

export async function GET() {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
    })
    .from(schema.users);
  return NextResponse.json({ ok: true, users: rows });
}
