import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getUserFromCookie } from "@/lib/auth";
import { toApiTask } from "@/lib/util";
import { newPosition } from "@/lib/fractional";
import { emitToBoard } from "@/lib/socket";
import { nanoid } from "nanoid";

export async function GET() {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const rows = await db
    .select()
    .from(schema.tasks)
    .orderBy(schema.tasks.status, schema.tasks.position);
  return NextResponse.json({ ok: true, tasks: rows.map(toApiTask) });
}

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(["low", "med", "high"]).default("med"),
  type: z.enum(["feature", "bug", "mock-api", "doc"]).default("feature"),
  assigneeId: z.string().min(1),
  status: z.enum(["todo", "doing", "review", "done"]).default("todo"),
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

  // Fall back to current user if assigneeId is empty
  const assigneeId = parsed.data.assigneeId || user.id;

  const id = nanoid(12);
  const now = Date.now();
  const row = {
    id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    status: parsed.data.status,
    priority: parsed.data.priority,
    type: parsed.data.type,
    assigneeId,
    createdById: user.id,
    position: newPosition(),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.tasks).values(row);

  const apiTask = toApiTask(row);
  emitToBoard("task:created", apiTask);
  return NextResponse.json({ ok: true, task: apiTask });
}
