// GET /api/tasks/[id]/documents
//
// 拿这个 task 关联的所有文档(join document_tasks + documents)
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id: taskId } = await params;

  // 校验 task 存在
  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId))
    .limit(1);
  if (!task) {
    return NextResponse.json({ ok: false, error: "任务不存在" }, { status: 404 });
  }

  // join document_tasks + documents
  const rows = await db
    .select({
      link: schema.documentTasks,
      doc: schema.documents,
    })
    .from(schema.documentTasks)
    .innerJoin(schema.documents, eq(schema.documentTasks.documentId, schema.documents.id))
    .where(eq(schema.documentTasks.taskId, taskId));

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
      document: {
        id: r.doc.id,
        title: r.doc.title,
        mode: r.doc.mode,
        createdAt:
          r.doc.createdAt instanceof Date
            ? r.doc.createdAt.getTime()
            : Number(r.doc.createdAt),
        updatedAt:
          r.doc.updatedAt instanceof Date
            ? r.doc.updatedAt.getTime()
            : Number(r.doc.updatedAt),
      },
    })),
  });
}
