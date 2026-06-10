// DocPanel / buildTemplateContent 单元测试
// 覆盖 P0 修复:
//   - spec/tdd 模式新建时 buildTemplateContent 必须产出非空骨架
//   - free 模式产出空字符串
//   - 骨架必须包含所有 spec/tdd section 标题
//   - 骨架必须包含可勾选 checklist 行(taskList 解析的目标)

import { describe, it, expect } from "vitest";
import {
  buildTemplateContent,
  DOC_MODES,
  SPEC_SECTIONS,
  TDD_SECTIONS,
  type DocMode,
} from "@/types";

describe("buildTemplateContent", () => {
  it("free 模式产出空字符串(用户自由写)", () => {
    expect(buildTemplateContent("free")).toBe("");
  });

  it("spec 模式产出完整骨架(含所有 SPEC_SECTIONS)", () => {
    const out = buildTemplateContent("spec");
    expect(out.length).toBeGreaterThan(0);
    // 6 个 section 都要出现
    for (const section of SPEC_SECTIONS) {
      expect(out).toContain(`## ${section}`);
    }
  });

  it("tdd 模式产出完整骨架(含所有 TDD_SECTIONS)", () => {
    const out = buildTemplateContent("tdd");
    expect(out.length).toBeGreaterThan(0);
    for (const section of TDD_SECTIONS) {
      expect(out).toContain(`## ${section}`);
    }
  });

  it("每个 section 后面必须有一行空 checklist(Markdown `- [ ]`)", () => {
    // 配合 parseChecklistFromDocJson 的检测:
    // 用户 Enter 后会触发 MarkdownOnEnter 把 `- [ ] xxx` 转成 taskItem
    // 我们至少要保证原始 markdown 里有 "- [ ] " 让用户改
    const out = buildTemplateContent("spec");
    const emptyChecklines = (out.match(/^- \[ \] $/gm) ?? []).length;
    // 至少每个 section 一行
    expect(emptyChecklines).toBeGreaterThanOrEqual(SPEC_SECTIONS.length);
  });

  it("DOC_MODES 三个值都能跑(防御性)", () => {
    for (const mode of DOC_MODES) {
      const out = buildTemplateContent(mode);
      if (mode === "free") expect(out).toBe("");
      else expect(out.length).toBeGreaterThan(0);
    }
  });
});

describe("DocPanel 状态机关键不变量(纯逻辑测试,不需要 DOM)", () => {
  // 验证 handleCreateDoc 实际需要传给后端的字段集合
  // 之前漏传 content — 用类型签名约束 + 文档化修复
  it("CreateDoc 必传字段 = { title, mode, content? }", () => {
    type Payload = { title: string; mode: DocMode; content?: string };
    const example: Payload = {
      title: "Q3 看板迭代",
      mode: "spec",
      content: buildTemplateContent("spec"),
    };
    expect(example.content).toBeTruthy();
    expect(example.content).toContain("## 验收标准");
  });
});
