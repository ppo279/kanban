import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";

const PostBody = z.object({
  documentId: z.string().min(1).max(64),
  taskId: z.string().min(1).max(64),
  sectionKey: z.string().max(200).nullable().optional(),
});

/** 创建文档-任务关联(已存在则忽略,保证幂等) */
export async function POST(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "参数错误", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { documentId, taskId, sectionKey } = parsed.data;

  // 校验两个 id 都存在,避免脏数据
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, documentId))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "文档不存在" }, { status: 404 });
  }
  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId))
    .limit(1);
  if (!task) {
    return NextResponse.json({ ok: false, error: "任务不存在" }, { status: 404 });
  }

  // 幂等插入:已存在则不报错
  const existing = await db
    .select()
    .from(schema.documentTasks)
    .where(
      and(
        eq(schema.documentTasks.documentId, documentId),
        eq(schema.documentTasks.taskId, taskId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(schema.documentTasks).values({
      documentId,
      taskId,
      sectionKey: sectionKey ?? null,
      createdAt: new Date(),
    });
  } else if (sectionKey && sectionKey !== existing[0].sectionKey) {
    // 允许更新 sectionKey(比如用户改了 checklist 行归属)
    await db
      .update(schema.documentTasks)
      .set({ sectionKey })
      .where(
        and(
          eq(schema.documentTasks.documentId, documentId),
          eq(schema.documentTasks.taskId, taskId)
        )
      );
  }

  return NextResponse.json({ ok: true });
}

/** 拿这个 doc 关联的所有 task(前端 DocPanel 的"关联任务"面板用) */
export async function GET(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("docId");
  if (!documentId) {
    return NextResponse.json(
      { ok: false, error: "缺少 docId" },
      { status: 400 }
    );
  }

  // 校验 doc 存在
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, documentId))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "文档不存在" }, { status: 404 });
  }

  // join document_tasks + tasks
  const rows = await db
    .select({
      link: schema.documentTasks,
      task: schema.tasks,
    })
    .from(schema.documentTasks)
    .innerJoin(schema.tasks, eq(schema.documentTasks.taskId, schema.tasks.id))
    .where(eq(schema.documentTasks.documentId, documentId));

  return NextResponse.json({
    ok: true,
    // 前端用 `items`,保持命名一致
    items: rows.map((r) => ({
      documentId: r.link.documentId,
      taskId: r.link.taskId,
      sectionKey: r.link.sectionKey,
      createdAt:
        r.link.createdAt instanceof Date
          ? r.link.createdAt.getTime()
          : Number(r.link.createdAt),
      task: {
        id: r.task.id,
        title: r.task.title,
        status: r.task.status,
        priority: r.task.priority,
        type: r.task.type,
        assigneeId: r.task.assigneeId,
        createdById: r.task.createdById,
        parentId: r.task.parentId,
        tags: r.task.tags ?? [],
        position: r.task.position,
        createdAt:
          r.task.createdAt instanceof Date
            ? r.task.createdAt.getTime()
            : Number(r.task.createdAt),
        updatedAt:
          r.task.updatedAt instanceof Date
            ? r.task.updatedAt.getTime()
            : Number(r.task.updatedAt),
        workspaceId: r.task.workspaceId,
      },
    })),
  });
}

/** 解除文档-任务关联(从 query 取 docId / taskId) */
export async function DELETE(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("docId");
  const taskId = searchParams.get("taskId");
  if (!documentId || !taskId) {
    return NextResponse.json(
      { ok: false, error: "缺少 docId 或 taskId" },
      { status: 400 }
    );
  }

  await db
    .delete(schema.documentTasks)
    .where(
      and(
        eq(schema.documentTasks.documentId, documentId),
        eq(schema.documentTasks.taskId, taskId)
      )
    );

  return NextResponse.json({ ok: true });
}
