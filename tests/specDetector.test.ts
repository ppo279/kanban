// specDetector 单元测试 — 覆盖核心启发式 + dedup 行为
//
// 真实场景 fixture:
// 1. 「接口设计」section + "GET /api/users" 描述 + JSON 响应体 → high confidence
// 2. 「接口设计」section + "POST /api/login" + JSON 看着像请求参数 → medium
// 3. 「接口设计」section + 描述但是 JSON 非法 → low
// 4. 「验收标准」section + 未勾的 taskItem → checklist candidate
// 5. 已转换的 codeBlock(data-converted) → 不出现
// 6. 已关联的 taskItem(data-task-id) → 不出现

import { describe, it, expect } from "vitest";
import {
  detectSpecCandidates,
  type TiptapNode,
} from "@/lib/specDetector";

// ── 工具:把一段段落文本包成 Tiptap paragraph 节点 ──
function p(text: string): TiptapNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
function h(text: string): TiptapNode {
  return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] };
}
function codeBlock(text: string, lang = "json", extraAttrs: Record<string, any> = {}): TiptapNode {
  return {
    type: "codeBlock",
    attrs: { language: lang, ...extraAttrs },
    content: [{ type: "text", text }],
  };
}
function taskItem(text: string, attrs: Record<string, any> = {}): TiptapNode {
  return {
    type: "taskItem",
    attrs: { checked: false, ...attrs },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}
function doc(content: TiptapNode[]): TiptapNode {
  return { type: "doc", content };
}

describe("specDetector", () => {
  it("detects high-confidence interface from response-shaped JSON", () => {
    const d = doc([
      h("接口设计"),
      p("获取用户列表"),
      p("GET /api/users?page=1"),
      codeBlock('{"code":200,"data":[{"id":1,"name":"a"}],"message":"ok"}'),
    ]);
    const out = detectSpecCandidates(d);
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.kind).toBe("interface");
    if (c.kind === "interface") {
      expect(c.proposed.method).toBe("GET");
      expect(c.proposed.path).toBe("/api/users?page=1");
      expect(c.proposed.mockStatusCode).toBe(200);
      expect(c.proposed.mockResponse).toContain('"id": 1');
      expect(c.confidence).toBe("high");
      expect(c.sectionKey).toBe("接口设计");
    }
  });

  it("detects medium-confidence when JSON looks like request params", () => {
    const d = doc([
      h("接口设计"),
      p("POST /api/users/list"),
      codeBlock('{"page":1,"pageSize":20,"sort":"desc"}'),
    ]);
    const out = detectSpecCandidates(d);
    expect(out).toHaveLength(1);
    const c = out[0]!;
    if (c.kind === "interface") {
      expect(c.proposed.method).toBe("POST");
      expect(c.proposed.path).toBe("/api/users/list");
      expect(c.confidence).toBe("medium");
      expect(c.proposed.mockResponse).toContain("请求参数");
    }
  });

  it("marks low-confidence when JSON is malformed but method+path present", () => {
    const d = doc([
      h("接口设计"),
      p("DELETE /api/users/123"),
      codeBlock("{not valid json"),
    ]);
    const out = detectSpecCandidates(d);
    expect(out).toHaveLength(1);
    const c = out[0]!;
    if (c.kind === "interface") {
      expect(c.proposed.method).toBe("DELETE");
      expect(c.proposed.path).toBe("/api/users/123");
      expect(c.confidence).toBe("low");
    }
  });

  it("skips already-converted codeBlocks (dedup via data-converted attr)", () => {
    const d = doc([
      h("接口设计"),
      p("GET /api/items"),
      codeBlock('{"code":200,"data":[]}', "json", {
        "data-converted": "iface_abc123",
        "data-converted-hash": "x",
      }),
    ]);
    const out = detectSpecCandidates(d);
    expect(out).toHaveLength(0);
  });

  it("detects checklist items in 验收标准 section", () => {
    const d = doc([
      h("验收标准"),
      taskItem("用户登录后看到首页"),
      taskItem("管理员能看到管理后台", { checked: true }), // 已勾,跳过
      taskItem("退出按钮可点击"),
    ]);
    const out = detectSpecCandidates(d);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.kind === "checklist")).toBe(true);
    const texts = (out as Array<{ proposed: { text: string } }>).map(
      (c) => c.proposed.text
    );
    expect(texts).toContain("用户登录后看到首页");
    expect(texts).toContain("退出按钮可点击");
  });

  it("skips taskItems already linked to a task", () => {
    const d = doc([
      h("验收标准"),
      taskItem("不要重复导我", { "data-task-id": "tsk_xyz" }),
    ]);
    const out = detectSpecCandidates(d);
    expect(out).toHaveLength(0);
  });

  it("sourceHash is stable and differs by content", () => {
    const d1 = doc([
      h("接口设计"),
      p("GET /api/a"),
      codeBlock('{"code":200,"data":1}'),
    ]);
    const d2 = doc([
      h("接口设计"),
      p("GET /api/a"),
      codeBlock('{"code":200,"data":1}'),
    ]);
    const a = detectSpecCandidates(d1)[0]!;
    const b = detectSpecCandidates(d2)[0]!;
    expect(a.sourceHash).toBe(b.sourceHash);

    const d3 = doc([
      h("接口设计"),
      p("GET /api/a"),
      codeBlock('{"code":200,"data":2}'), // 内容不同
    ]);
    const c = detectSpecCandidates(d3)[0]!;
    expect(c.sourceHash).not.toBe(a.sourceHash);
  });

  it("returns empty array for null/empty doc", () => {
    expect(detectSpecCandidates(null)).toEqual([]);
    expect(detectSpecCandidates(undefined)).toEqual([]);
    expect(detectSpecCandidates(doc([]))).toEqual([]);
  });

  it("extracts description from JSON when present", () => {
    const d = doc([
      h("接口设计"),
      p("GET /api/profile"),
      codeBlock(
        '{"code":200,"description":"获取当前用户信息","data":{"id":1}}'
      ),
    ]);
    const c = detectSpecCandidates(d)[0]!;
    if (c.kind === "interface") {
      expect(c.proposed.description).toBe("获取当前用户信息");
    }
  });

  it("handles nested nodes (codeBlock inside listItem, taskItem inside taskList)", () => {
    const d = doc([
      h("接口设计"),
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              p("PUT /api/users/:id"),
              codeBlock('{"code":200,"data":{"updated":true}}'),
            ],
          },
        ],
      } as TiptapNode,
      h("验收标准"),
      {
        type: "taskList",
        content: [taskItem("嵌套的 taskItem 也能命中")],
      } as TiptapNode,
    ]);
    const out = detectSpecCandidates(d);
    expect(out).toHaveLength(2);
    expect(out.some((c) => c.kind === "interface")).toBe(true);
    expect(out.some((c) => c.kind === "checklist")).toBe(true);
  });

  it("ignores non-json codeBlock languages", () => {
    const d = doc([
      h("接口设计"),
      p("GET /api/whatever"),
      codeBlock("console.log('hello')", "javascript"),
    ]);
    const out = detectSpecCandidates(d);
    // javascript 代码块不解析为 JSON,但因为没标 data-converted 也没标 json 语言,会被过滤
    // 其实代码块没被过滤的情况下,我们尝试 JSON.parse 失败 → confidence low
    // 当前实现:language !== "json" 直接跳过
    expect(out).toHaveLength(0);
  });
});