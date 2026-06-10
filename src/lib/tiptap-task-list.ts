// 自定义 Tiptap 节点:TaskList + TaskItem
// 用于协作文档里的 checklist 行 — 表达"可勾选 + 可关联任务"的最小单元
//
// 设计决策:
// - done / taskId 都作为节点 attr,跟随 Y.Doc 实时同步
// - 用 React NodeView 渲染 checkbox UI,符合用户对任务清单的直觉
// - MarkdownOnEnter 在 CollaborativeEditor.tsx 里负责把段落 `- [ ] xxx` 转成 taskItem
// - taskId 跟后端 document_tasks 表是双写的真理源:
//   * node.attrs.taskId: 客户端 UI 同步用(快速渲染"已关联到 T-xxx")
//   * document_tasks 表: 关联查询 / 反向 task→doc 用(权威)
//   * 启动时从 DB 拉到 editor state 做 merge,保证新会话的人立刻看到

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { TaskItemView } from "@/components/docs/TaskItemView";

export const TaskList = Node.create({
  name: "taskList",
  group: "block listGroup",
  // 允许 taskItem 跟普通 listItem 混排(其实不太需要,这里留灵活)
  content: "taskItem+",
  parseHTML() {
    return [{ tag: "ul[data-type='taskList']" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "ul",
      mergeAttributes(HTMLAttributes, { "data-type": "taskList" }),
      0,
    ];
  },
});

export const TaskItem = Node.create({
  name: "taskItem",
  // taskItem 内容只是 inline 文本(paragraph),不允许嵌套 block
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      done: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-done") === "true",
        renderHTML: (attrs) => ({
          "data-done": attrs.done ? "true" : "false",
        }),
      },
      taskId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-task-id") || null,
        renderHTML: (attrs) =>
          attrs.taskId ? { "data-task-id": attrs.taskId } : {},
      },
      // 「待审」section 用 — 标记这个 taskItem 已经被 detect 提过
      // (避免重复弹;不写表示未提)
      reviewed: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-reviewed") || null,
        renderHTML: (attrs) =>
          attrs.reviewed ? { "data-reviewed": attrs.reviewed } : {},
      },
      // 「待审」section 用 — 标「已衍生 task」时,带 section 信息方便后续查
      sectionKey: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-section-key") || null,
        renderHTML: (attrs) =>
          attrs.sectionKey ? { "data-section-key": attrs.sectionKey } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "li[data-type='taskItem']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(HTMLAttributes, { "data-type": "taskItem" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskItemView);
  },
});
