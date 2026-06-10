import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { toApiTask } from "@/lib/util";

/** 拿该文档关联的所有 task(join document_tasks + tasks) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id: documentId } = await params;

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
    links: rows.map((r) => ({
      documentId: r.link.documentId,
      taskId: r.link.taskId,
      sectionKey: r.link.sectionKey,
      createdAt:
        r.link.createdAt instanceof Date
          ? r.link.createdAt.getTime()
          : Number(r.link.createdAt),
      task: toApiTask(r.task),
    })),
  });
}
