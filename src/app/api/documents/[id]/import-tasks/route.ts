// POST /api/documents/[id]/import-tasks
//
// 把 spec/tdd 文档的 checklist 项批量导入为任务,自动建立父-子结构:
//   - 父任务:文档标题(放在 todo 列,priority/assignee 用入参)
//   - 子任务:每个 checklist 项,parentId 指向父任务
//
// 幂等:同文档下,sectionKey + text 相同的 checklist 已有 task → 跳过
//
// 入参:
//   items: [{ sectionKey, text }, ...]
//   defaultPriority?: "low" | "med" | "high"
//   parentTitle?: string  (默认 = 文档标题,生成 spec 父任务时用)
//
// 返回:
//   { ok, created: n, skipped: n, parentTask: {...}, createdTasks: [...] }

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUserFromCookie } from "@/lib/auth";
import { toApiTask } from "@/lib/util";
import { newPosition } from "@/lib/fractional";
import { emitToBoard } from "@/lib/socket";
import { recomputeAncestors } from "@/lib/taskTree";

const Item = z.object({
  sectionKey: z.string().min(1).max(100),
  text: z.string().min(1).max(500),
});

const Body = z.object({
  items: z.array(Item).min(1).max(200),
  defaultPriority: z.enum(["low", "med", "high"]).default("med"),
  /** 父任务标题 — 默认用文档标题 */
  parentTitle: z.string().min(1).max(200).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id: documentId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "参数错误", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, documentId))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "文档不存在" }, { status: 404 });
  }

  const { items, defaultPriority } = parsed.data;
  const parentTitle = parsed.data.parentTitle ?? doc.title;

  // ── 1. 查重:拿这个文档已经关联的 task 列表,跟入参 text 比对,命中的跳过 ──
  // 用 text(title)+ sectionKey 双重去重,避免不同 section 里碰巧同名的内容被误判
  const existingLinks = await db
    .select({
      taskId: schema.documentTasks.taskId,
      sectionKey: schema.documentTasks.sectionKey,
      title: schema.tasks.title,
    })
    .from(schema.documentTasks)
    .innerJoin(schema.tasks, eq(schema.documentTasks.taskId, schema.tasks.id))
    .where(eq(schema.documentTasks.documentId, documentId));

  const existingKeys = new Set(
    existingLinks.map((l) => `${l.sectionKey ?? ""}::${l.title}`)
  );

  // ── 2. 过滤:挑出真要新创建的 items ──
  const toCreate = items.filter(
    (it) => !existingKeys.has(`${it.sectionKey}::${it.text}`)
  );
  const skipped = items.length - toCreate.length;

  if (toCreate.length === 0) {
    return NextResponse.json({
      ok: true,
      created: 0,
      skipped,
      parentTask: null,
      createdTasks: [],
    });
  }

  // ── 3. 批量创建:父任务 + 子任务 ──
  // workspaceId 从 doc 直接拿(已经 SELECT 过了)
  const workspaceId = doc.workspaceId;
  const now = Date.now();
  const parentId = nanoid(12);
  const parentRow = {
    id: parentId,
    title: parentTitle,
    description: `来源: 文档「${doc.title}」(${doc.mode} 模式)的 checklist 自动生成`,
    status: "todo" as const,
    priority: defaultPriority,
    type: "feature" as const,
    assigneeId: user.id,
    createdById: user.id,
    parentId: null,
    // drizzle mode:"json" 自动处理,直接传 string[]
    tags: [] as string[],
    workspaceId,
    position: newPosition(),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.tasks).values(parentRow);

  const createdTasks = [];
  for (const item of toCreate) {
    const childId = nanoid(12);
    const childRow = {
      id: childId,
      title: item.text.slice(0, 200), // 截断到 title 长度上限
      description: `来源: ${doc.title} > ${item.sectionKey}`,
      status: "todo" as const,
      priority: defaultPriority,
      type: "feature" as const,
      assigneeId: user.id,
      createdById: user.id,
      parentId,
      tags: [] as string[],
      workspaceId,
      position: newPosition(),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
    await db.insert(schema.tasks).values(childRow);
    // 关联到 document
    await db.insert(schema.documentTasks).values({
      documentId,
      taskId: childId,
      sectionKey: item.sectionKey,
      createdAt: new Date(now),
    });
    createdTasks.push(toApiTask(childRow));
  }

  // 把父任务也关联到 document(spec → 父任务,方便在 spec 里看到父任务的进度)
  await db.insert(schema.documentTasks).values({
    documentId,
    taskId: parentId,
    sectionKey: "__parent__",
    createdAt: new Date(now),
  });

  // 广播事件
  const apiParent = toApiTask(parentRow);
  emitToBoard("task:created", apiParent);
  for (const t of createdTasks) emitToBoard("task:created", t);

  // 触发 rollup(虽然所有子都是 todo,父也是 todo,语义上没事但跑一遍保证一致)
  await recomputeAncestors(parentId);

  return NextResponse.json({
    ok: true,
    created: toCreate.length,
    skipped,
    parentTask: apiParent,
    createdTasks,
  });
}
