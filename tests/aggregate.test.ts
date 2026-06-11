// 聚合视图(只读,跨项目看所有任务)单元测试
//
// 设计:
//   - GET /api/tasks?workspaceId=__all__ → 跨所有 ws 返回任务
//   - PATCH/move/DELETE 带 __all__ → 403(越权)
//   - 写操作 task.workspaceId 跟 __all__ 不匹配 → 走"if (urlWsId && urlWsId !== task.wsId) 403" 自动挡
import { describe, it, expect, beforeEach } from "vitest";
import { GET as listTasks, POST as createTask } from "@/app/api/tasks/route";
import { PATCH as updateTask, DELETE as deleteTask } from "@/app/api/tasks/[id]/route";
import { PATCH as moveTask } from "@/app/api/tasks/[id]/move/route";
import { makeReq, loginAs, clearAuth } from "./helpers";

const WS_A = "ws_agg_a";
const WS_B = "ws_agg_b";

async function ensureWs(id: string, name: string) {
  const { db, schema } = await import("@/lib/db");
  const { eq } = await import("drizzle-orm");
  const existing = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  if (existing.length === 0) {
    await db.insert(schema.workspaces).values({
      id,
      name,
      background: "aggregate test",
      createdById: "u_frontend",
    });
  }
  return id;
}

beforeEach(async () => {
  clearAuth();
  await loginAs("u_frontend");
  await ensureWs(WS_A, "项目 A");
  await ensureWs(WS_B, "项目 B");
});

describe("聚合视图 ?workspaceId=__all__", () => {
  it("GET: 返回所有 ws 的任务(含 demo seed)", async () => {
    // 在 A 和 B 各建一个任务
    await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "A 任务",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_A,
      })
    );
    await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "B 任务",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_B,
      })
    );

    const r = await listTasks(makeReq("GET", "http://x/api/tasks?workspaceId=__all__"));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(d.isAggregate).toBe(true);

    // 至少含 A + B + demo 的任务
    const titles = d.tasks.map((t: any) => t.title);
    expect(titles).toContain("A 任务");
    expect(titles).toContain("B 任务");
    // demo seed 8 个任务
    const demo = d.tasks.filter((t: any) => t.workspaceId === "ws_demo");
    expect(demo.length).toBeGreaterThanOrEqual(8);

    // 含多个 wsId
    const wsIds = new Set(d.tasks.map((t: any) => t.workspaceId));
    expect(wsIds.size).toBeGreaterThanOrEqual(3); // demo + A + B
  });

  it("GET: 普通 wsId 返回 isAggregate=false", async () => {
    const r = await listTasks(makeReq("GET", `http://x/api/tasks?workspaceId=${WS_A}`));
    const d = await r.json();
    expect(d.isAggregate).toBe(false);
    // 不应包含 B 的任务
    const bTask = d.tasks.find((t: any) => t.workspaceId === WS_B);
    expect(bTask).toBeUndefined();
  });
});

describe("聚合视图严格只读(后端防御)", () => {
  it("PATCH /api/tasks/:id: 用 __all__ 当 wsId → 403", async () => {
    const cr = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "要保",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_A,
      })
    );
    const t = (await cr.json()).task;

    const r = await updateTask(
      makeReq("PATCH", `http://x/api/tasks/${t.id}?workspaceId=__all__`, {
        title: "想通过聚合改",
      }),
      { params: Promise.resolve({ id: t.id }) }
    );
    expect(r.status).toBe(403);
  });

  it("PATCH /api/tasks/:id/move: 用 __all__ → 403", async () => {
    const cr = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "要移动",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_A,
      })
    );
    const t = (await cr.json()).task;

    const r = await moveTask(
      makeReq("PATCH", `http://x/api/tasks/${t.id}/move?workspaceId=__all__`, {
        status: "review",
        position: 999,
      }),
      { params: Promise.resolve({ id: t.id }) }
    );
    expect(r.status).toBe(403);
  });

  it("DELETE /api/tasks/:id: 用 __all__ → 403", async () => {
    const cr = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "要删",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_A,
      })
    );
    const t = (await cr.json()).task;

    const r = await deleteTask(
      makeReq("DELETE", `http://x/api/tasks/${t.id}?workspaceId=__all__`),
      { params: Promise.resolve({ id: t.id }) }
    );
    expect(r.status).toBe(403);

    // 任务还在
    const lr = await listTasks(makeReq("GET", `http://x/api/tasks?workspaceId=${WS_A}`));
    const all = (await lr.json()).tasks;
    expect(all.find((x: any) => x.id === t.id)).toBeDefined();
  });

  it("POST /api/tasks: 不传 wsId 仍 400(聚合不支持 POST)", async () => {
    // POST tasks 后端要求 body.workspaceId,__all__ 是 query 标记,不是合法的 body wsId
    // 这里测的是"普通 POST 漏 wsId"仍正确返回 400
    const r = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "x",
        priority: "low",
        assigneeId: "u_frontend",
      })
    );
    expect(r.status).toBe(400);
  });
});
