"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import { Extension } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";
import { Bold } from "@tiptap/extension-bold";
import { Italic } from "@tiptap/extension-italic";
import { Strike } from "@tiptap/extension-strike";
import { Code } from "@tiptap/extension-code";
import { CodeBlock } from "@tiptap/extension-code-block";
import { Blockquote } from "@tiptap/extension-blockquote";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { Link } from "@tiptap/extension-link";
import { BulletList, OrderedList } from "@tiptap/extension-list";
import { getSocketInstance } from "@/hooks/useSocket";
import { getYDoc, getAwareness, connectCollaboration } from "@/lib/collaboration";
import { CustomCursorPlugin } from "@/lib/tiptap-cursor-plugin";
import { TaskList, TaskItem } from "@/lib/tiptap-task-list";
import { EditorToolbar } from "./EditorToolbar";
import { Button } from "@/components/ui/button";
import type { Awareness } from "y-protocols/awareness";

interface Props {
  docId: string;
  initialContent: string;
  userId: string;
  userName: string;
  cursorColor: string;
  onSave: (content: string) => Promise<void>;
  /** checklist 行数变化时回调(0 ↔ n) */
  onChecklistChange?: (hasChecklist: boolean) => void;
  /** checklist 进度统计 — 给文档顶部进度条用 */
  onChecklistStatsChange?: (stats: { total: number; checked: number }) => void;
}

/** 暴露给父组件的命令式 API(DocPanel 用) */
export interface CollaborativeEditorHandle {
  /** 在文档末尾插入一个空 checklist 行(taskList + taskItem) */
  insertChecklistRow: () => boolean;
  /** 在光标位置插入文本(用于 AI 生成内容等场景) */
  insertContent: (text: string) => boolean;
  /** 是否有 checklist 行(空状态判断用) */
  hasChecklist: () => boolean;
  /** 替换整个文档内容(AI 接管场景) */
  setContent: (text: string) => boolean;
  /**
   * 在 doc 里找一个 codeBlock 节点(按 sourceHash 在 JSON 树里匹配,不太精确但够用),
   * 给它打上 data-converted attr,这样下次 detectSpecCandidates 不会重复提
   * @returns 找到并打标返回 true
   */
  markCodeBlockConverted: (sourceHash: string, entityId: string) => boolean;
  /**
   * 给 taskItem 节点打 data-task-id + data-section-key,做"已衍生 task"标记
   * @param sourceText 节点文字内容(用于在 tree 里定位)
   */
  markTaskItemConverted: (sourceText: string, taskId: string, sectionKey: string) => boolean;
  /**
   * 找 codeBlock / taskItem 节点并高亮(临时加 data-highlight=true attr,500ms 后自动去掉)
   * 给「待审」section 点 item 时高亮对应源用
   */
  highlightSource: (kind: "interface" | "checklist", sourceHash: string) => boolean;
}

/** 将纯文本转换为 Tiptap JSON（每个段落为一行） */
function textToTiptapJSON(text: string) {
  const lines = text.split("\n");
  const content = lines.map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));
  return { type: "doc", content };
}

/**
 * Markdown 快捷输入扩展
 * 设计: 按 Enter 键时,扫描当前段落,若整段是合法 markdown 则转换。
 *      解决了 "输 `# 1` 后必须输空格才生效" 的不直观问题,贴近 Typora/Obsidian 习惯。
 *
 * 为什么用 Enter 而不是 input rule:
 *   1. Tiptap 的 InputRule 是"输字符时"触发(空格/`*`),要求用户**记住**每个语法前后该输什么
 *   2. 用户更自然的写法是"我先随便写,写完一行按回车让它变成 markdown"
 *   3. 跟 @tiptap/extension-collaboration 兼容性更好 — input rule 在 collab 下需要各种 trick
 *
 * 实现:
 *   - 拦截 Enter keydown (addKeyboardShortcuts 返回 true)
 *   - 取 $from.parent 拿到当前 paragraph/heading/listItem
 *   - 文本 trim 后匹配下列规则
 *   - 匹配上: 在一个 transaction 里删掉 markdown 符号 + 改 block type + 加 mark
 *   - 匹配不上: return false,让默认 enter 走(新开一段)
 */

/** 找到光标所在的最里层可被转换的 block (paragraph/heading/listItem),返回 {node, pos} 或 null */
function getConvertibleBlock(state: any): { node: any; pos: number; $from: any } | null {
  const { $from } = state.selection;
  const depth = $from.depth;
  for (let d = depth; d >= 0; d--) {
    const node = $from.node(d);
    if (node.isTextblock) {
      return { node, pos: $from.before(d), $from };
    }
  }
  return null;
}

/** 检测整段内容是否整段都是某个 markdown 行内标记,若是,返回 { text, marks[] } */
function detectInlineMarkdown(text: string, schema: any): { text: string; marks: any[] } | null {
  const marks: any[] = [];
  let body = text;

  // **加粗** / __加粗__
  let m = body.match(/^\*\*([^\s*][^*]*?[^\s*]|[^\s*])\*\*$/) || body.match(/^__([^\s_][^_]*?[^\s_]|[^\s_])__$/);
  if (m && schema.marks.bold) {
    marks.push(schema.marks.bold.create());
    body = m[1];
  }
  // ~~删除线~~
  m = body.match(/^~~([^\s~][^~]*?[^\s~]|[^\s~])~~$/);
  if (m && schema.marks.strike) {
    marks.push(schema.marks.strike.create());
    body = m[1];
  }
  // *斜体* / _斜体_
  m = body.match(/^\*([^\s*][^*]*?[^\s*]|[^\s*])\*$/) || body.match(/^_([^\s_][^_]*?[^\s_]|[^\s_])_$/);
  if (m && schema.marks.italic) {
    marks.push(schema.marks.italic.create());
    body = m[1];
  }
  // `行内代码`
  m = body.match(/^`([^`\s][^`]*?[^`\s]|[^`\s])`$/);
  if (m && schema.marks.code) {
    marks.push(schema.marks.code.create());
    body = m[1];
  }
  // [文本](url)
  m = body.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
  if (m && schema.marks.link) {
    marks.push(schema.marks.link.create({ href: m[2] }));
    body = m[1];
  }

  if (marks.length === 0) return null;
  return { text: body, marks };
}

const MarkdownOnEnter = Extension.create({
  name: "markdownOnEnter",

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const state = editor.state;
        const block = getConvertibleBlock(state);
        if (!block) return false;

        const { node } = block;
        // 段落必须非空
        if (node.content.size === 0) return false;

        const text = node.textContent;
        const trimmed = text.trim();
        if (!trimmed) return false;

        const schema = state.schema;
        const headingNode = schema.nodes.heading;
        const paragraphNode = schema.nodes.paragraph;
        const codeBlockNode = schema.nodes.codeBlock;
        const blockquoteNode = schema.nodes.blockquote;
        const bulletListNode = schema.nodes.bulletList;
        const orderedListNode = schema.nodes.orderedList;
        const listItemNode = schema.nodes.listItem;
        const taskListNode = schema.nodes.taskList;
        const taskItemNode = schema.nodes.taskItem;
        const horizontalRuleNode = schema.nodes.horizontalRule;

        // ── 块级规则 ──
        // 共同模式: 改 block type + 删掉 markdown 符号 + 替换为新文本
        // 用 tr.replaceWith(from+1, to-1, newContent) 一次完成,避免分步 position 错乱

        // # / ## / ### ... 标题 (要求 # 后必须有内容,空 `#` 不转)
        const hMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (hMatch && headingNode) {
          const level = hMatch[1].length;
          const content = hMatch[2];
          const from = block.pos;
          const to = block.pos + node.nodeSize;
          const tr = state.tr;
          // 一次性替换整段为 heading,避免 setBlockType + replaceWith 导致内容重复
          tr.replaceRangeWith(from, to, headingNode.create({ level }, schema.text(content)));
          editor.view.dispatch(tr);
          return true;
        }

        // ``` 代码块 (整段就 ```,转成空 code block)
        if (trimmed === "```" && codeBlockNode) {
          const from = block.pos;
          const to = block.pos + node.nodeSize;
          const tr = state.tr;
          tr.setBlockType(from, to, codeBlockNode);
          // 删掉段内全部内容
          tr.delete(from + 1, to - 1);
          editor.view.dispatch(tr);
          return true;
        }

        // - [ ] / - [x] 任务清单(必放在 ul 规则之前,否则被吞)
        const tlMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (tlMatch && taskListNode && taskItemNode) {
          const done = tlMatch[1] !== " ";
          const content = tlMatch[2];
          const from = block.pos;
          const to = block.pos + node.nodeSize;
          const tr = state.tr;
          tr.replaceRangeWith(
            from,
            to,
            taskListNode.create(
              null,
              taskItemNode.create(
                { done, taskId: null },
                content ? schema.text(content) : null
              )
            )
          );
          editor.view.dispatch(tr);
          return true;
        }

        // > 引用块
        const qMatch = trimmed.match(/^>\s+(.*)$/);
        if (qMatch && blockquoteNode) {
          const content = qMatch[1];
          const from = block.pos;
          const to = block.pos + node.nodeSize;
          const tr = state.tr;
          // blockquote 要求 block 子节点,不能直接放 text — 包一层 paragraph
          tr.replaceRangeWith(
            from,
            to,
            blockquoteNode.create(null, paragraphNode.create(null, schema.text(content)))
          );
          editor.view.dispatch(tr);
          return true;
        }

        // - / * 无序列表
        // 用 (?!\[[ x]\]) 排除 task list 语法,避免 `- [ ] xxx` 被 ul 吞掉
        const ulMatch = trimmed.match(/^[-*]\s+(?!\[[ x]\])(.*)$/);
        if (ulMatch && bulletListNode && listItemNode) {
          const content = ulMatch[1];
          const from = block.pos;
          const to = block.pos + node.nodeSize;
          const tr = state.tr;
          // listItem 不是 textblock,不能 setBlockType — 用 replaceRangeWith 创建完整结构
          tr.replaceRangeWith(
            from,
            to,
            bulletListNode.create(
              null,
              listItemNode.create(null, paragraphNode.create(null, schema.text(content)))
            )
          );
          editor.view.dispatch(tr);
          return true;
        }

        // 1. / 1) 有序列表
        const olMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
        if (olMatch && orderedListNode && listItemNode) {
          const content = olMatch[2];
          const from = block.pos;
          const to = block.pos + node.nodeSize;
          const tr = state.tr;
          // listItem 不是 textblock,不能 setBlockType — 用 replaceRangeWith 创建完整结构
          tr.replaceRangeWith(
            from,
            to,
            orderedListNode.create(
              null,
              listItemNode.create(null, paragraphNode.create(null, schema.text(content)))
            )
          );
          editor.view.dispatch(tr);
          return true;
        }

        // --- / *** 水平线
        if ((trimmed === "---" || trimmed === "***") && horizontalRuleNode) {
          const from = block.pos;
          const to = block.pos + node.nodeSize;
          const tr = state.tr;
          // 水平线必须放在 paragraph 里(它是 inline atom block)
          tr.setBlockType(from, to, paragraphNode);
          tr.replaceWith(from + 1, to - 1, horizontalRuleNode.create());
          editor.view.dispatch(tr);
          return true;
        }

        // ── 行内规则 (整段内容都是 mark 标记时) ──
        const inline = detectInlineMarkdown(trimmed, schema);
        if (inline && inline.text && paragraphNode) {
          const from = block.pos;
          const to = block.pos + node.nodeSize;
          const tr = state.tr;
          tr.setBlockType(from, to, paragraphNode);
          // 整段替换为带 mark 的文本
          tr.replaceWith(from + 1, to - 1, schema.text(inline.text, inline.marks));
          editor.view.dispatch(tr);
          return true;
        }

        // 没匹配上,让默认 enter 走 (新开一段)
        return false;
      },
    };
  },
});

/**
 * 创建一个禁用 input rules 的扩展副本
 * 用于替换 StarterKit 中自带 input rules 的那些扩展,
 * 这样用户输入 `# title` + 空格 时不会立刻转换,
 * 而是等按 Enter 时由 MarkdownOnEnter 处理。
 */
function withoutInputRules<T extends Extension>(Ext: any): T {
  return (Ext as any).extend({ addInputRules: () => [] });
}

export const CollaborativeEditor = forwardRef<
  CollaborativeEditorHandle,
  Props
>(function CollaborativeEditor({
  docId,
  initialContent,
  userId,
  userName,
  cursorColor,
  onSave,
  onChecklistChange,
  onChecklistStatsChange,
}, ref) {
  const savedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const contentLoadedRef = useRef(false);
  const syncedRef = useRef(false);
  const awRef = useRef<Awareness | null>(null);

  const yDoc = getYDoc(docId);
  // 必须在 useEditor() 之前获取 Awareness，这样 CollaborationCursor 才能拿到非 null 的引用
  const awareness = getAwareness(docId, userId, userName, cursorColor);
  awRef.current = awareness;

  const editor = useEditor({
    extensions: [
      // StarterKit 提供基础扩展(Document/Text/Paragraph 等不含 input rules 的扩展)
      StarterKit.configure({
        // @ts-ignore - Tiptap v3 API differences
        history: false,
        // 禁用所有自带 input rules 的扩展,改用下方手动引入的无 input rules 版本
        heading: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        horizontalRule: false,
        link: false,
      }),
      // 手动注册各扩展,禁用 input rules → 只在 Enter 时触发转换
      withoutInputRules(Heading),
      withoutInputRules(Bold),
      withoutInputRules(Italic),
      withoutInputRules(Strike),
      withoutInputRules(Code),
      // CodeBlock: 加 data-converted / data-converted-hash / data-flash 三个 attr
      // — 「待审」section 用来标"已提取"和"临时高亮"
      withoutInputRules(
        CodeBlock.extend({
          addAttributes() {
            return {
              language: {
                default: null,
                parseHTML: (el) => el.getAttribute("language"),
                renderHTML: (attrs) =>
                  attrs.language ? { language: attrs.language } : {},
              },
              "data-converted": {
                default: null,
                parseHTML: (el) => el.getAttribute("data-converted") || null,
                renderHTML: (attrs) =>
                  attrs["data-converted"]
                    ? { "data-converted": attrs["data-converted"] }
                    : {},
              },
              "data-converted-hash": {
                default: null,
                parseHTML: (el) =>
                  el.getAttribute("data-converted-hash") || null,
                renderHTML: (attrs) =>
                  attrs["data-converted-hash"]
                    ? { "data-converted-hash": attrs["data-converted-hash"] }
                    : {},
              },
              "data-flash": {
                default: null,
                parseHTML: (el) => el.getAttribute("data-flash") || null,
                renderHTML: (attrs) =>
                  attrs["data-flash"]
                    ? { "data-flash": attrs["data-flash"] }
                    : {},
              },
            };
          },
        })
      ),
      withoutInputRules(Blockquote),
      withoutInputRules(BulletList),
      withoutInputRules(OrderedList),
      withoutInputRules(HorizontalRule),
      // Link 用 addInputRules? 它实际用 addPasteRules + addProseMirrorPlugins(autolink),
      // 没有 input rules，使用 configure({ autolink: false, linkOnPaste: false })
      // 避免粘贴 URL 时自动生成链接——让用户按 Enter 再处理
      Link.configure({
        autolink: false,
        linkOnPaste: false,
      }),
      // 任务清单 checklist — 核心扩展:把 `- [ ] xxx` 转成可勾选 / 可关联任务的节点
      TaskList,
      TaskItem,
      Placeholder.configure({
        placeholder: "开始写作… 支持 Markdown 快捷输入(回车生效),输入 `- [ ]` 创建任务清单",
      }),
      // Markdown 快捷输入: 按 Enter 时扫描当前段,匹配整段 markdown 则转换
      MarkdownOnEnter,
      Collaboration.configure({
        document: yDoc,
        field: "content",
      }),
      CustomCursorPlugin.configure({
        awareness,
        user: {
          name: userName,
          color: cursorColor,
        },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none",
      },
    },
    immediatelyRender: false,
    onUpdate: () => {
      savedRef.current = false;
    },
  });

  // Setup collaboration connection
  useEffect(() => {
    const socket = getSocketInstance();
    if (!socket) return;
    if (!awRef.current) return;

    cleanupRef.current = connectCollaboration(docId, userId, userName, awRef.current, socket, () => {
      syncedRef.current = true;
    });

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      syncedRef.current = false;
    };
  }, [docId, userId, userName]);

  // Load initial content after editor is ready and Y.Doc is empty.
  // Wait 800ms for sync state from peers before falling back to DB content.
  useEffect(() => {
    if (!editor || contentLoadedRef.current) return;
    if (!initialContent) return;

    const timer = setTimeout(() => {
      // If synced state already arrived via socket, Y.Doc already has content
      // and this will naturally skip because yXml.length > 0
      const yXml = yDoc.getXmlFragment("content");
      if (yXml.length === 0) {
        try {
          const parsed = JSON.parse(initialContent);
          if (parsed?.type === "doc" && Array.isArray(parsed.content)) {
            editor.commands.setContent(parsed);
          } else {
            editor.commands.setContent(textToTiptapJSON(String(parsed)));
          }
        } catch {
          editor.commands.setContent(textToTiptapJSON(initialContent));
        }
      }
      contentLoadedRef.current = true;
    }, 800);

    return () => clearTimeout(timer);
  }, [editor, initialContent, yDoc]);

  const handleSave = useCallback(() => {
    if (!editor || savedRef.current) return;
    // 保存 JSON 格式的文档结构（含 heading/bold/list 等格式），
    // 纯文本用 editor.getText() 会丢掉所有格式。
    const content = JSON.stringify(editor.getJSON());
    onSave(content);
    savedRef.current = true;
  }, [editor, onSave]);

  // 监听文档变化,通知父组件 checklist 状态(用于空状态文案分情况)
  useEffect(() => {
    if (!editor || !onChecklistChange) return;
    const handler = () => {
      let has = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "taskList") {
          has = true;
          return false;
        }
        return true;
      });
      onChecklistChange(has);
    };
    editor.on("update", handler);
    // 立即触发一次,把初始 checklist 状态推给父组件
    handler();
    return () => {
      editor.off("update", handler);
    };
  }, [editor, onChecklistChange]);

  // 监听 checklist 进度统计(给顶部进度条用)
  useEffect(() => {
    if (!editor || !onChecklistStatsChange) return;
    const compute = () => {
      let total = 0;
      let checked = 0;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "taskItem") {
          total++;
          if (node.attrs.done) checked++;
        }
      });
      onChecklistStatsChange({ total, checked });
    };
    editor.on("update", compute);
    compute(); // 立即推一次,反映当前文档状态
    return () => {
      editor.off("update", compute);
    };
  }, [editor, onChecklistStatsChange]);

  // 暴露命令式 API 给父组件(DocPanel)用
  useImperativeHandle(
    ref,
    () => ({
      insertChecklistRow: () => {
        if (!editor) return false;
        // 跳到文档末尾,确保插入在最后
        editor.commands.focus("end");
        // 插入空 taskList(包含一个空 taskItem)
        // 用 chain 保证在协作模式下走 ProseMirror 的 transaction,会被 Y.js 捕获
        return editor
          .chain()
          .insertContent({
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { done: false, taskId: null },
                content: [{ type: "text", text: "" }],
              },
            ],
          })
          .focus()
          .run();
      },
      insertContent: (text: string) => {
        if (!editor) return false;
        editor.commands.focus("end");
        return editor.chain().insertContent(text).focus().run();
      },
      hasChecklist: () => {
        if (!editor) return false;
        // 用 ProseMirror 状态查 taskList 节点
        let found = false;
        editor.state.doc.descendants((node) => {
          if (node.type.name === "taskList" || node.type.name === "taskItem") {
            found = true;
            return false; // 找到了就停
          }
          return true;
        });
        return found;
      },
      setContent: (text: string) => {
        if (!editor) return false;
        try {
          const parsed = JSON.parse(text);
          if (parsed?.type === "doc") {
            return editor.commands.setContent(parsed);
          }
        } catch {
          /* not JSON, fall through */
        }
        return editor.commands.setContent(textToTiptapJSON(text));
      },
      markCodeBlockConverted: (sourceHash: string, entityId: string) => {
        if (!editor) return false;
        let found = false;
        editor.state.doc.descendants((node, pos) => {
          if (found) return false;
          if (node.type.name !== "codeBlock") return true;
          // sourceHash 是 detector 那边算的(基于 text 前 200 字),
          // 我们这里用相同的算法重算
          const text = node.textContent || "";
          const key = (
            "interface|" + text.slice(0, 200)
          ).split("").reduce((h: number, c: string) => ((h << 5) + h + c.charCodeAt(0)) | 0, 5381).toString(36);
          if (key !== sourceHash) return true;
          // 设置 data-converted attr
          editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes("codeBlock", {
              "data-converted": entityId,
              "data-converted-hash": sourceHash,
            })
            .run();
          found = true;
          return false;
        });
        return found;
      },
      markTaskItemConverted: (sourceText: string, taskId: string, sectionKey: string) => {
        if (!editor) return false;
        let found = false;
        const wantText = sourceText.trim();
        const wantHash = ("checklist|" + wantText).split("").reduce((h, c) => ((h << 5) + h + c.charCodeAt(0)) | 0, 5381).toString(36);
        editor.state.doc.descendants((node, pos) => {
          if (found) return false;
          if (node.type.name !== "taskItem") return true;
          const text = (node.textContent || "").trim();
          if (text !== wantText) return true;
          editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes("taskItem", {
              "data-task-id": taskId,
              "data-section-key": sectionKey,
            })
            .run();
          found = true;
          return false;
        });
        return found;
      },
      highlightSource: (kind, sourceHash) => {
        if (!editor) return false;
        let found = false;
        const targetType = kind === "interface" ? "codeBlock" : "taskItem";
        const prefix = kind === "interface" ? "interface|" : "checklist|";
        editor.state.doc.descendants((node, pos) => {
          if (found) return false;
          if (node.type.name !== targetType) return true;
          const text = node.textContent || "";
          const key = (
            prefix + text.slice(0, 200)
          ).split("").reduce((h: number, c: string) => ((h << 5) + h + c.charCodeAt(0)) | 0, 5381).toString(36);
          if (key !== sourceHash) return true;
          // 临时高亮(500ms)
          editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes(targetType, { "data-flash": "true" })
            .run();
          // 滚动到
          try {
            editor.commands.focus();
            const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
            if (dom) {
              dom.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          } catch {
            // ignore
          }
          setTimeout(() => {
            if (!editor) return;
            try {
              editor
                .chain()
                .setNodeSelection(pos)
                .updateAttributes(targetType, { "data-flash": null })
                .run();
            } catch {
              // editor might be destroyed
            }
          }, 1500);
          found = true;
          return false;
        });
        return found;
      },
    }),
    [editor]
  );

  return (
    <div className="flex flex-col h-full" data-doc-panel-root>
      <div className="flex-1 overflow-auto border rounded-md flex flex-col">
        <EditorToolbar editor={editor} />
        <EditorContent editor={editor} className="w-full flex-1 p-3" />
      </div>
      <div className="flex justify-end pt-2">
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleSave}
        >
          保存
        </Button>
      </div>
    </div>
  );
});
