// 任务父子关系 + rollup 状态测试
//
// 不打 db,只测纯函数 rollupStatus — 集成测试交给 e2e
import { describe, it, expect } from "vitest";
import { rollupStatus } from "@/lib/taskTree";

describe("rollupStatus", () => {
  it("空 children → todo", () => {
    expect(rollupStatus([])).toBe("todo");
  });

  it("全 todo → todo", () => {
    expect(rollupStatus([{ status: "todo" }, { status: "todo" }])).toBe("todo");
  });

  it("任一 doing → doing(最活跃优先)", () => {
    expect(rollupStatus([{ status: "todo" }, { status: "doing" }])).toBe("doing");
    expect(rollupStatus([{ status: "doing" }, { status: "doing" }])).toBe("doing");
  });

  it("任一 review → review(review 比 doing 更接近完成)", () => {
    expect(rollupStatus([{ status: "todo" }, { status: "review" }])).toBe("review");
    expect(rollupStatus([{ status: "doing" }, { status: "review" }])).toBe("review");
  });

  it("全 done → done", () => {
    expect(rollupStatus([{ status: "done" }, { status: "done" }])).toBe("done");
  });

  it("混合(完成中)→ doing 而非 done", () => {
    expect(rollupStatus([{ status: "done" }, { status: "doing" }])).toBe("doing");
    expect(rollupStatus([{ status: "done" }, { status: "todo" }])).toBe("doing");
  });

  it("混合(review + done)→ review", () => {
    expect(rollupStatus([{ status: "done" }, { status: "review" }])).toBe("review");
  });

  it("边界:done + review + doing → review(优先级最高)", () => {
    expect(rollupStatus([{ status: "done" }, { status: "review" }, { status: "doing" }])).toBe("review");
  });

  it("只有 1 个 done 子任务 → 父也 done", () => {
    expect(rollupStatus([{ status: "done" }])).toBe("done");
  });
});
