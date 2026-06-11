// POST /api/spec-interfaces/[id]/create-mock
//
// 一键把 spec 里定义的结构化接口转成 mock-api 任务 + api_interface
// 流程:
//  1. 读 spec_interface
//  2. 检查是否已转过(derived_task_id)
//  3. 找 / 建一个 module 分类
//  4. 建一个 task(type=mock-api)
//  5. 建一个 api_interface,挂到 task
//  6. 反向更新 spec_interface 的 derived_task_id / derived_interface_id
//  7. 关联到 document_tasks(让 task 在 doc 关联列表里也能看到)
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { newPosition } from "@/lib/fractional";
import { nanoid } from "nanoid";
import { emitToBoard } from "@/lib/socket";
import { toApiTask } from "@/lib/util";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  const { id: specInterfaceId } = await params;

  // 1. 读 spec_interface
  const [spec] = await db
    .select()
    .from(schema.specInterfaces)
    .where(eq(schema.specInterfaces.id, specInterfaceId))
    .limit(1);
  if (!spec) {
    return NextResponse.json({ ok: false, error: "接口定义不存在" }, { status: 404 });
  }

  // 2. 已转过?直接返回已存在的
  if (spec.derivedTaskId) {
    const [task] = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, spec.derivedTaskId))
      .limit(1);
    const [iface] = await db
      .select()
      .from(schema.apiInterfaces)
      .where(eq(schema.apiInterfaces.id, spec.derivedInterfaceId ?? ""))
      .limit(1);
    return NextResponse.json({
      ok: true,
      alreadyCreated: true,
      task: task ? toApiTask(task) : null,
      interface: iface,
    });
  }

  // 3. 找 / 建 module — 用 spec 文档标题作为默认 module 名
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, spec.documentId))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "关联文档不存在" }, { status: 404 });
  }
  // 多项目隔离:module 必须在同一个 workspace
  const workspaceId = doc.workspaceId;

  // 拿一个 module(默认 spec 文档同名),且必须在同一 workspace 下;不存在就建
  let moduleId: string | null = null;
  const allModules = await db
    .select()
    .from(schema.apiModules)
    .where(eq(schema.apiModules.workspaceId, workspaceId));
  const matched = allModules.find((m) => m.name === doc.title);
  if (matched) {
    moduleId = matched.id;
  } else {
    const newModId = nanoid(12);
    await db.insert(schema.apiModules).values({
      id: newModId,
      workspaceId,
      name: doc.title,
      description: `从 spec「${doc.title}」衍生`,
      responseWrapper: null,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    moduleId = newModId;
  }

  // 4. 建 mock-api 任务
  const taskId = nanoid(12);
  const now = Date.now();
  const taskRow = {
    id: taskId,
    title: spec.name,
    description: spec.description ?? `从 spec「${doc.title}」的「接口设计」section 一键生成`,
    status: "todo" as const,
    priority: "med" as const,
    type: "mock-api" as const,
    assigneeId: user.id,
    createdById: user.id,
    parentId: null,
    tags: [] as string[],
    workspaceId,
    position: newPosition(),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.tasks).values(taskRow);

  // 5. 建 api_interface
  const interfaceId = nanoid(12);
  const ifaceRow = {
    id: interfaceId,
    moduleId: moduleId!,
    taskId,
    name: spec.name,
    method: spec.method,
    path: spec.path,
    description: spec.description ?? null,
    requestSchema: spec.requestSchema ?? null,
    responseSchema: spec.responseSchema ?? null,
    mockResponse: spec.mockResponse ?? '{"code": 200, "data": null, "message": "ok"}',
    mockStatusCode: spec.mockStatusCode,
    requestFields: null,
    mockFields: null,
    responseMode: "inherit" as const,
    customWrapper: null,
    mockHeaders: null,
    swaggerUrl: null,
    status: "draft" as const,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  await db.insert(schema.apiInterfaces).values(ifaceRow);

  // 6. 反向更新 spec_interface
  await db
    .update(schema.specInterfaces)
    .set({
      derivedTaskId: taskId,
      derivedInterfaceId: interfaceId,
      updatedAt: new Date(),
    })
    .where(eq(schema.specInterfaces.id, specInterfaceId));

  // 7. document_tasks 关联 — 让 task 在 doc 的"关联任务"列表里也出现
  await db.insert(schema.documentTasks).values({
    documentId: spec.documentId,
    taskId,
    sectionKey: "接口设计",
    createdAt: new Date(now),
  });

  // 8. 广播 task:created
  const apiTask = toApiTask(taskRow);
  emitToBoard("task:created", apiTask);

  return NextResponse.json({
    ok: true,
    alreadyCreated: false,
    task: apiTask,
    interface: ifaceRow,
  });
}
