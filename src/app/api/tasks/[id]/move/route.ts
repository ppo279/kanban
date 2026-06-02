import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { toApiTask } from "@/lib/util";
import { emitToBoard } from "@/lib/socket";

const Body = z.object({
  status: z.enum(["todo", "doing", "review", "done"]),
  position: z.number().finite(),
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
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "参数错误" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, id))
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ ok: false, error: "任务不存在" }, { status: 404 });
  }
  // Any authenticated user on the board can move tasks

  await db
    .update(schema.tasks)
    .set({
      status: parsed.data.status,
      position: parsed.data.position,
      updatedAt: new Date(),
    })
    .where(eq(schema.tasks.id, id));

  const updated = (await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, id))
    .limit(1))[0];

  const apiTask = toApiTask(updated);
  emitToBoard("task:moved", {
    id: apiTask.id,
    status: apiTask.status,
    position: apiTask.position,
  });
  return NextResponse.json({ ok: true, task: apiTask });
}
