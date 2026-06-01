import { describe, it, expect, beforeEach } from "vitest";
import { GET as listTasks, POST as createTask } from "@/app/api/tasks/route";
import { PATCH as updateTask, DELETE as deleteTask } from "@/app/api/tasks/[id]/route";
import { PATCH as moveTask } from "@/app/api/tasks/[id]/move/route";
import { GET as listUsers } from "@/app/api/users/route";
import { makeReq, loginAs, clearAuth } from "./helpers";

describe("users", () => {
  beforeEach(async () => {
    clearAuth();
    await loginAs("u_frontend");
  });

  it("GET /api/users: 返回 3 个预置账号", async () => {
    const r = await listUsers();
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(d.users.length).toBe(3);
    const ids = d.users.map((u: any) => u.id).sort();
    expect(ids).toEqual(["u_backend", "u_frontend", "u_testing"]);
  });
});

describe("tasks", () => {
  beforeEach(async () => {
    clearAuth();
    await loginAs("u_frontend");
  });

  it("GET /api/tasks: 返回 seed 后的任务", async () => {
    const r = await listTasks();
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(d.tasks.length).toBeGreaterThanOrEqual(8);
    const t = d.tasks[0];
    expect(t).toHaveProperty("id");
    expect(t).toHaveProperty("title");
    expect(t).toHaveProperty("status");
    expect(t).toHaveProperty("priority");
    expect(t).toHaveProperty("position");
    expect(typeof t.position).toBe("number");
    // 按 status + position 排序
    for (let i = 1; i < d.tasks.length; i++) {
      if (d.tasks[i - 1].status === d.tasks[i].status) {
        expect(d.tasks[i - 1].position).toBeLessThanOrEqual(d.tasks[i].position);
      }
    }
  });

  it("POST /api/tasks: 新建任务", async () => {
    const r = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "测试任务 A",
        description: "由 Vitest 创建",
        priority: "high",
        assigneeId: "u_testing",
      })
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(d.task.title).toBe("测试任务 A");
    expect(d.task.status).toBe("todo");
    expect(d.task.priority).toBe("high");
    expect(d.task.createdById).toBe("u_frontend");
    expect(d.task.assigneeId).toBe("u_testing");
  });

  it("POST /api/tasks: 缺 title 400", async () => {
    const r = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        description: "无标题",
        priority: "low",
        assigneeId: "u_testing",
      })
    );
    expect(r.status).toBe(400);
  });

  it("POST /api/tasks: 错 priority 400", async () => {
    const r = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "x",
        priority: "ULTRA",
        assigneeId: "u_testing",
      })
    );
    expect(r.status).toBe(400);
  });

  it("POST /api/tasks: title 超长 400", async () => {
    const r = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "x".repeat(201),
        priority: "low",
        assigneeId: "u_testing",
      })
    );
    expect(r.status).toBe(400);
  });

  it("PATCH /api/tasks/:id: 改自己创建的任务标题", async () => {
    const lr = await listTasks();
    const all = (await lr.json()).tasks as any[];
    const mine = all.find((t) => t.createdById === "u_frontend");
    if (!mine) return;
    const r = await updateTask(
      makeReq("PATCH", `http://x/api/tasks/${mine.id}`, { title: "改过的标题" }),
      { params: Promise.resolve({ id: mine.id }) }
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.task.title).toBe("改过的标题");
  });

  it("PATCH /api/tasks/:id: 别人任务 403", async () => {
    const lr = await listTasks();
    const all = (await lr.json()).tasks as any[];
    const others = all.find((t) => t.createdById !== "u_frontend" && t.assigneeId !== "u_frontend");
    if (!others) return;
    const r = await updateTask(
      makeReq("PATCH", `http://x/api/tasks/${others.id}`, { title: "想改别人" }),
      { params: Promise.resolve({ id: others.id }) }
    );
    expect(r.status).toBe(403);
  });

  it("PATCH /api/tasks/:id: 不存在 404", async () => {
    const r = await updateTask(
      makeReq("PATCH", "http://x/api/tasks/nonexistent", { title: "x" }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );
    expect(r.status).toBe(404);
  });

  it("PATCH /api/tasks/:id/move: 移动到 review 成功", async () => {
    const lr = await listTasks();
    const all = (await lr.json()).tasks as any[];
    const target = all.find((t) => t.createdById === "u_frontend" || t.assigneeId === "u_frontend");
    if (!target) return;
    const newPos = target.position + 100;
    const r = await moveTask(
      makeReq("PATCH", `http://x/api/tasks/${target.id}/move`, { status: "review", position: newPos }),
      { params: Promise.resolve({ id: target.id }) }
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.task.status).toBe("review");
    expect(d.task.position).toBe(newPos);
  });

  it("PATCH /api/tasks/:id/move: 错状态 400", async () => {
    const lr = await listTasks();
    const all = (await lr.json()).tasks as any[];
    const target = all.find((t) => t.createdById === "u_frontend" || t.assigneeId === "u_frontend");
    if (!target) return;
    const r = await moveTask(
      makeReq("PATCH", `http://x/api/tasks/${target.id}/move`, { status: "WRONG", position: 1 }),
      { params: Promise.resolve({ id: target.id }) }
    );
    expect(r.status).toBe(400);
  });

  it("PATCH /api/tasks/:id/move: 不存在 404", async () => {
    const r = await moveTask(
      makeReq("PATCH", "http://x/api/tasks/nonexistent/move", { status: "review", position: 1 }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );
    expect(r.status).toBe(404);
  });

  it("DELETE /api/tasks/:id: 删自己创建的任务", async () => {
    const cr = await createTask(
      makeReq("POST", "http://x/api/tasks", {
        title: "要删的任务",
        priority: "low",
        assigneeId: "u_frontend",
      })
    );
    const created = (await cr.json()).task;

    const r = await deleteTask(makeReq("DELETE", `http://x/api/tasks/${created.id}`), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(r.status).toBe(200);

    const lr = await listTasks();
    const all = (await lr.json()).tasks as any[];
    expect(all.find((t) => t.id === created.id)).toBeUndefined();
  });

  it("DELETE /api/tasks/:id: 别人任务 403", async () => {
    const lr = await listTasks();
    const all = (await lr.json()).tasks as any[];
    const others = all.find((t) => t.createdById !== "u_frontend" && t.assigneeId !== "u_frontend");
    if (!others) return;
    const r = await deleteTask(makeReq("DELETE", `http://x/api/tasks/${others.id}`), {
      params: Promise.resolve({ id: others.id }),
    });
    expect(r.status).toBe(403);
  });

  it("GET /api/tasks: 未登录 401", async () => {
    clearAuth();
    const r = await listTasks();
    expect(r.status).toBe(401);
  });
});
