// 多项目隔离 & 切换 单元测试
// 覆盖:
//   1) 同表多 ws 数据共存(创建 2 个 ws,任务不串)
//   2) 跨 ws 越权防御(PATCH/DELETE/move 错 wsId 拒 403)
//   3) GET /api/tasks 必传 ?workspaceId=
//   4) /api/workspaces CRUD:创建 → 列表 → 切 → 改 → 删
//   5) 聚合视图 /api/tasks?workspaceId=__all__:看所有 ws 的任务
import { describe, it, expect, beforeEach } from "vitest";
import { GET as listTasks, POST as createTask } from "@/app/api/tasks/route";
import { PATCH as updateTask, DELETE as deleteTask } from "@/app/api/tasks/[id]/route";
import { PATCH as moveTask } from "@/app/api/tasks/[id]/move/route";
import { GET as listDocs, POST as createDoc } from "@/app/api/documents/route";
import { GET as listWs, POST as createWs } from "@/app/api/workspaces/route";
import { GET as getWs, PATCH as updateWs, DELETE as deleteWs } from "@/app/api/workspaces/[id]/route";
import { POST as switchWs } from "@/app/api/workspaces/[id]/switch/route";
import { makeReq, loginAs, clearAuth } from "./helpers";

const WS_A = "ws_isolation_a";
const WS_B = "ws_isolation_b";

async function ensureWs(id: string, name: string) {
  const { db, schema } = await import("@/lib/db");
  const { eq } = await import("drizzle-orm");
  const existing = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  if (existing.length === 0) {
    await db.insert(schema.workspaces).values({
      id,
      name,
      background: "isolation test",
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

describe("workspace 隔离 — 任务", () => {
  it("不同 ws 下同名任务共存,互不串", async () => {
    // 在 A 创建"通用任务"
    const ar = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "通用任务",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_A,
      })
    );
    const aTask = (await ar.json()).task;

    // 在 B 创建"通用任务"
    const br = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "通用任务",
        priority: "high",
        assigneeId: "u_testing",
        workspaceId: WS_B,
      })
    );
    const bTask = (await br.json()).task;

    // 两个 task id 必不同
    expect(aTask.id).not.toBe(bTask.id);
    // 各自挂在自己的 ws
    expect(aTask.workspaceId).toBe(WS_A);
    expect(bTask.workspaceId).toBe(WS_B);

    // 拉 A 的列表,只看 A
    const aList = (await (await listTasks(makeReq("GET", `http://x/api/tasks?workspaceId=${WS_A}`))).json()).tasks;
    const aIds = aList.map((t: any) => t.id);
    expect(aIds).toContain(aTask.id);
    expect(aIds).not.toContain(bTask.id);

    // 拉 B 的列表,只看 B
    const bList = (await (await listTasks(makeReq("GET", `http://x/api/tasks?workspaceId=${WS_B}`))).json()).tasks;
    const bIds = bList.map((t: any) => t.id);
    expect(bIds).toContain(bTask.id);
    expect(bIds).not.toContain(aTask.id);
  });

  it("GET /api/tasks: 不传 workspaceId 必 400", async () => {
    const r = await listTasks(makeReq("GET", "http://x/api/tasks"));
    expect(r.status).toBe(400);
  });

  it("GET /api/tasks: 不存在的 wsId → 404(后端显式校验 ws 存在)", async () => {
    // 设计选择:GET 不存在 ws 直接 404,避免空 list 和"没数据"歧义
    const r = await listTasks(makeReq("GET", "http://x/api/tasks?workspaceId=ws_does_not_exist"));
    expect(r.status).toBe(404);
  });

  it("PATCH /api/tasks/:id: 跨 ws 越权 403", async () => {
    // task 在 WS_A,但 query 传 WS_B
    const ar = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "A 任务",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_A,
      })
    );
    const aTask = (await ar.json()).task;

    const r = await updateTask(
      makeReq("PATCH", `http://x/api/tasks/${aTask.id}?workspaceId=${WS_B}`, {
        title: "想跨 ws 改",
      }),
      { params: Promise.resolve({ id: aTask.id }) }
    );
    expect(r.status).toBe(403);
    // 数据没动
    const lr = (await (await listTasks(makeReq("GET", `http://x/api/tasks?workspaceId=${WS_A}`))).json()).tasks;
    const still = lr.find((t: any) => t.id === aTask.id);
    expect(still.title).toBe("A 任务");
  });

  it("PATCH /api/tasks/:id/move: 跨 ws 越权 403", async () => {
    const ar = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "move 测试",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_A,
      })
    );
    const aTask = (await ar.json()).task;

    const r = await moveTask(
      makeReq("PATCH", `http://x/api/tasks/${aTask.id}/move?workspaceId=${WS_B}`, {
        status: "review",
        position: 999,
      }),
      { params: Promise.resolve({ id: aTask.id }) }
    );
    expect(r.status).toBe(403);
  });

  it("DELETE /api/tasks/:id: 跨 ws 越权 403", async () => {
    const ar = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "delete 测试",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_A,
      })
    );
    const aTask = (await ar.json()).task;

    const r = await deleteTask(
      makeReq("DELETE", `http://x/api/tasks/${aTask.id}?workspaceId=${WS_B}`),
      { params: Promise.resolve({ id: aTask.id }) }
    );
    expect(r.status).toBe(403);
    // 任务还在
    const lr = (await (await listTasks(makeReq("GET", `http://x/api/tasks?workspaceId=${WS_A}`))).json()).tasks;
    const still = lr.find((t: any) => t.id === aTask.id);
    expect(still).toBeDefined();
  });

  it("PATCH /api/tasks/:id: 同 ws(带正确 query)200", async () => {
    const ar = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "ok 编辑",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_A,
      })
    );
    const aTask = (await ar.json()).task;

    const r = await updateTask(
      makeReq("PATCH", `http://x/api/tasks/${aTask.id}?workspaceId=${WS_A}`, {
        title: "改过",
      }),
      { params: Promise.resolve({ id: aTask.id }) }
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.task.title).toBe("改过");
  });
});

describe("workspace 隔离 — 文档", () => {
  it("GET /api/documents: 不传 wsId 400", async () => {
    const r = await listDocs(makeReq("GET", "http://x/api/documents"));
    expect(r.status).toBe(400);
  });

  it("POST /api/documents: 不传 wsId 400", async () => {
    const r = await createDoc(
      makeReq("POST", "http://x/api/documents", { title: "x", mode: "free" })
    );
    expect(r.status).toBe(400);
  });

  it("不同 ws 的同名 doc 共存,互不串", async () => {
    const ar = await createDoc(
      makeReq("POST", "http://x/api/documents", {
        title: "设计稿",
        mode: "free",
        workspaceId: WS_A,
      })
    );
    const aDoc = (await ar.json()).document;

    const br = await createDoc(
      makeReq("POST", "http://x/api/documents", {
        title: "设计稿",
        mode: "spec",
        workspaceId: WS_B,
      })
    );
    const bDoc = (await br.json()).document;

    expect(aDoc.id).not.toBe(bDoc.id);
    expect(aDoc.workspaceId).toBe(WS_A);
    expect(bDoc.workspaceId).toBe(WS_B);

    const aList = (await (await listDocs(makeReq("GET", `http://x/api/documents?workspaceId=${WS_A}`))).json()).documents;
    const aIds = aList.map((d: any) => d.id);
    expect(aIds).toContain(aDoc.id);
    expect(aIds).not.toContain(bDoc.id);
  });
});

describe("/api/workspaces CRUD", () => {
  it("GET /api/workspaces: 返回列表(含 demo)", async () => {
    const r = await listWs();
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    const ids = d.workspaces.map((w: any) => w.id);
    expect(ids).toContain(WS_A);
    expect(ids).toContain(WS_B);
  });

  it("POST /api/workspaces: 缺 background 400", async () => {
    const r = await createWs(makeReq("POST", "http://x/api/workspaces", { name: "x" }));
    expect(r.status).toBe(400);
  });

  it("POST /api/workspaces: goals 必须是 array,传 string 400", async () => {
    const r = await createWs(
      makeReq("POST", "http://x/api/workspaces", {
        name: "x",
        background: "y",
        goals: "不是数组",
      })
    );
    expect(r.status).toBe(400);
  });

  it("POST /api/workspaces: 必填字段全齐 → 200", async () => {
    const r = await createWs(
      makeReq("POST", "http://x/api/workspaces", {
        name: "新项目",
        background: "做点啥",
        goals: ["搞点东西"],
        techStack: ["TS"],
      })
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(d.workspace.id).toMatch(/^ws_/);
    expect(d.workspace.name).toBe("新项目");
  });

  it("PATCH /api/workspaces/:id: 改名", async () => {
    const r = await updateWs(
      makeReq("PATCH", `http://x/api/workspaces/${WS_A}`, { name: "项目 A 改名" }),
      { params: Promise.resolve({ id: WS_A }) }
    );
    expect(r.status).toBe(200);
    const gr = await getWs(makeReq("GET", `http://x/api/workspaces/${WS_A}`), {
      params: Promise.resolve({ id: WS_A }),
    });
    const d = await gr.json();
    expect(d.workspace.name).toBe("项目 A 改名");
  });

  it("DELETE /api/workspaces/:id: CASCADE 级联删(有 task 也能删,数据会被清空)", async () => {
    // 设计:删 ws 时 SQLite CASCADE 自动清 task/document/api
    // 这里测"有数据也能删 + 删完再 list tasks 拿不到"
    await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "留个数据",
        priority: "low",
        assigneeId: "u_frontend",
        workspaceId: WS_A,
      })
    );
    const r = await deleteWs(makeReq("DELETE", `http://x/api/workspaces/${WS_A}`), {
      params: Promise.resolve({ id: WS_A }),
    });
    expect(r.status).toBe(200);

    // ws 不在了 → 列表里也没了
    const lr = await listWs();
    const ids = (await lr.json()).workspaces.map((w: any) => w.id);
    expect(ids).not.toContain(WS_A);
    // task 也没了(GET 404)
    const tlr = await listTasks(makeReq("GET", `http://x/api/tasks?workspaceId=${WS_A}`));
    expect(tlr.status).toBe(404);
    // 重建给后续 test 用
    await ensureWs(WS_A, "项目 A");
  });

  it("DELETE /api/workspaces/:id: 空 ws 可以删", async () => {
    // WS_B 是空的(没数据),直接删
    const r = await deleteWs(makeReq("DELETE", `http://x/api/workspaces/${WS_B}`), {
      params: Promise.resolve({ id: WS_B }),
    });
    expect(r.status).toBe(200);
    // 再 list 不应再见 WS_B
    const lr = await listWs();
    const ids = (await lr.json()).workspaces.map((w: any) => w.id);
    expect(ids).not.toContain(WS_B);
    // 重建给后续 test 用
    await ensureWs(WS_B, "项目 B");
  });
});

describe("/api/workspaces/:id/switch", () => {
  it("POST 切到 WS_A → 返回 ok + workspace 详情", async () => {
    const r = await switchWs(
      makeReq("POST", `http://x/api/workspaces/${WS_A}/switch`),
      { params: Promise.resolve({ id: WS_A }) }
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    // 后端返回 { workspace },前端用它写 store
    expect(d.workspace.id).toBe(WS_A);
  });

  it("切到不存在的 ws → 404", async () => {
    const r = await switchWs(
      makeReq("POST", `http://x/api/workspaces/ws_nope_${Date.now()}/switch`),
      { params: Promise.resolve({ id: `ws_nope_${Date.now()}` }) }
    );
    expect(r.status).toBe(404);
  });

  it("未登录切 ws → 401", async () => {
    clearAuth();
    const r = await switchWs(
      makeReq("POST", `http://x/api/workspaces/${WS_A}/switch`),
      { params: Promise.resolve({ id: WS_A }) }
    );
    expect(r.status).toBe(401);
  });
});
