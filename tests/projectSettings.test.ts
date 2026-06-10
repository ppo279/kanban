// Project settings API 测试
// 覆盖:
//   - 未登录拦截
//   - GET 返回默认 settings(setup 已 seed)
//   - PATCH 单字段更新(name/background/goals/nonGoals/techStack)
//   - PATCH 空 body 拦截
//   - PATCH 字段类型校验
//   - PATCH 后 GET 拿到新值 + updatedById 是改的人

import { describe, it, expect, beforeEach } from "vitest";
import { GET, PATCH } from "@/app/api/project-settings/route";
import { makeReq, loginAs, clearAuth } from "./helpers";

describe("project-settings", () => {
  beforeEach(() => clearAuth());

  it("GET: 未登录返回 401", async () => {
    const r = await GET();
    expect(r.status).toBe(401);
  });

  it("GET: 登录后返回默认 settings", async () => {
    await loginAs("u_frontend");
    const r = await GET();
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(d.settings.name).toBe("kanban");
    expect(d.settings.goals).toEqual([]);
    expect(d.settings.nonGoals).toEqual([]);
    expect(d.settings.techStack).toEqual([]);
    expect(d.settings.background).toBeNull();
    expect(typeof d.settings.updatedAt).toBe("number");
  });

  it("PATCH: 未登录返回 401", async () => {
    const r = await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", { name: "x" })
    );
    expect(r.status).toBe(401);
  });

  it("PATCH: 空 body 返回 400", async () => {
    await loginAs("u_frontend");
    const r = await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", {})
    );
    expect(r.status).toBe(400);
  });

  it("PATCH: 字段类型错(goals 不是数组)返回 400", async () => {
    await loginAs("u_frontend");
    const r = await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", { goals: "not array" })
    );
    expect(r.status).toBe(400);
  });

  it("PATCH: 任意登录用户都能改 + updatedById 记录是谁", async () => {
    await loginAs("u_testing");
    const r = await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", {
        name: "team-kanban",
        background: "3 人小队的多人协作平台",
        goals: ["支持实时协作", "降低沟通成本"],
        nonGoals: ["不做权限系统"],
        techStack: ["Next.js", "Tiptap", "Yjs"],
      })
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(d.settings.name).toBe("team-kanban");
    expect(d.settings.background).toBe("3 人小队的多人协作平台");
    expect(d.settings.goals).toEqual(["支持实时协作", "降低沟通成本"]);
    expect(d.settings.nonGoals).toEqual(["不做权限系统"]);
    expect(d.settings.techStack).toEqual(["Next.js", "Tiptap", "Yjs"]);
    expect(d.settings.updatedById).toBe("u_testing");

    // 再次 GET 验证持久化
    const r2 = await GET();
    const d2 = await r2.json();
    expect(d2.settings.name).toBe("team-kanban");
    expect(d2.settings.techStack).toEqual(["Next.js", "Tiptap", "Yjs"]);
  });

  it("PATCH: 部分更新(只传一个字段)不会清空其他字段", async () => {
    await loginAs("u_frontend");
    // 先全量更新一次
    await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", {
        name: "kanban",
        background: "background",
        goals: ["g1"],
        nonGoals: ["ng1"],
        techStack: ["TS"],
      })
    );
    // 只改 name
    const r = await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", { name: "kanban-v2" })
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.settings.name).toBe("kanban-v2");
    // 其他字段保留
    expect(d.settings.background).toBe("background");
    expect(d.settings.goals).toEqual(["g1"]);
    expect(d.settings.nonGoals).toEqual(["ng1"]);
    expect(d.settings.techStack).toEqual(["TS"]);
  });

  it("PATCH: 显式传空数组 = 清空,跟未传不同", async () => {
    await loginAs("u_backend");
    await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", {
        techStack: ["A", "B", "C"],
      })
    );
    // 不传 — 不变
    const r1 = await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", { name: "kanban" })
    );
    const d1 = await r1.json();
    expect(d1.settings.techStack).toEqual(["A", "B", "C"]);

    // 传空数组 — 清空
    const r2 = await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", { techStack: [] })
    );
    const d2 = await r2.json();
    expect(d2.settings.techStack).toEqual([]);
  });

  it("PATCH: 数组长度超 50 截掉", async () => {
    await loginAs("u_frontend");
    const tooMany = Array.from({ length: 60 }, (_, i) => `goal-${i}`);
    const r = await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", { goals: tooMany })
    );
    // 校验失败 → 400
    expect(r.status).toBe(400);
  });

  it("PATCH: 单元素超长(name > 200)被 Zod 截", async () => {
    await loginAs("u_frontend");
    const r = await PATCH(
      makeReq("PATCH", "http://x/api/project-settings", { name: "x".repeat(201) })
    );
    expect(r.status).toBe(400);
  });
});
