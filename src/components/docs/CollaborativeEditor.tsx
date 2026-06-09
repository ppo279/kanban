"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent, InputRule } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import { Extension, markInputRule } from "@tiptap/core";
import { getSocketInstance } from "@/hooks/useSocket";
import { getYDoc, getAwareness, connectCollaboration } from "@/lib/collaboration";
import { CustomCursorPlugin } from "@/lib/tiptap-cursor-plugin";
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
 * Custom Markdown 快捷输入扩展
 * 显式添加 input rules 使其与 @tiptap/extension-collaboration 兼容
 */
const MarkdownInput = Extension.create({
  name: "markdownInput",

  addInputRules() {
    return [
      // 标题: # → h1, ## → h2, ..., ###### → h6
      ...[1, 2, 3, 4, 5, 6].map((level) => {
        const regex = new RegExp(`^#{1,${level}}\\s$`);
        return new InputRule({
          find: regex,
          handler: ({ state, range, match }) => {
            const $from = state.doc.resolve(range.from);
            const nodeType = state.schema.nodes.heading;
            if (nodeType) {
              state.tr
                .delete(range.from - match[0].length, range.to)
                .setBlockType($from.pos, $from.end(), nodeType, { level });
            }
          },
        });
      }),
      // 无序列表: * 或 - 后跟空格
      new InputRule({
        find: /^\s*([-*])\s$/,
        handler: ({ state, range, match }) => {
          const nodeType = state.schema.nodes.bulletList;
          const listItemType = state.schema.nodes.listItem;
          if (nodeType && listItemType) {
            state.tr
              .delete(range.from - match[0].length, range.to)
              .replaceRangeWith(range.from, range.from, nodeType.create(null, listItemType.create(null)));
          }
        },
      }),
      // 有序列表: 1. 后跟空格
      new InputRule({
        find: /^\s*(\d+)\.\s$/,
        handler: ({ state, range, match }) => {
          const nodeType = state.schema.nodes.orderedList;
          const listItemType = state.schema.nodes.listItem;
          if (nodeType && listItemType) {
            state.tr
              .delete(range.from - match[0].length, range.to)
              .replaceRangeWith(range.from, range.from, nodeType.create(null, listItemType.create(null)));
          }
        },
      }),
      // 引用块: > 后跟空格
      new InputRule({
        find: /^\s*>\s$/,
        handler: ({ state, range, match }) => {
          const nodeType = state.schema.nodes.blockquote;
          if (nodeType) {
            state.tr
              .delete(range.from - match[0].length, range.to)
              .setBlockType(range.from, range.from, nodeType);
          }
        },
      }),
      // 代码块: ``` 后跟空格
      new InputRule({
        find: /^```\s$/,
        handler: ({ state, range, match }) => {
          const nodeType = state.schema.nodes.codeBlock;
          if (nodeType) {
            state.tr
              .delete(range.from - match[0].length, range.to)
              .setBlockType(range.from, range.from, nodeType);
          }
        },
      }),
      // 水平线: --- 或 *** 后跟空格
      new InputRule({
        find: /^(---|\*\*\*)\s$/,
        handler: ({ state, range, match }) => {
          const nodeType = state.schema.nodes.horizontalRule;
          if (nodeType) {
            state.tr
              .delete(range.from - match[0].length, range.to)
              .replaceSelectionWith(nodeType.create());
          }
        },
      }),
    ];
  },
});

/**
 * 行内 Markdown 快捷输入
 * 显式注册行内 mark 的 input rules,使其与 @tiptap/extension-collaboration 兼容
 * (StarterKit 自带的行内 mark input rules 在 collab 模式下静默失效)
 *
 * 支持:
 *   **加粗**  /  __加粗__       → bold
 *   *斜体*    /  _斜体_         → italic
 *   ~~删除线~~                  → strike
 *   `行内代码`                  → code
 *   [文本](https://...)         → link
 *
 * 注意:
 *   - 使用 (?:^|\s) 前缀,避免在 1*2*3 / a_b_c 这类表达式里误触
 *   - markInputRule 拿正则的最后一个 capture group 作为 mark 目标文本
 *   - 末位 `$` 锚定要求完整闭合才触发
 *   - 防御性: schema 缺 mark 时跳过(不抛错,不影响其他 mark 工作)
 */
const InlineMarkdown = Extension.create({
  name: "inlineMarkdown",

  addInputRules() {
    // this.editor 在 addInputRules 调用时已经就绪,可以拿 schema
    const marks = this.editor.schema.marks;
    const rules: InputRule[] = [];

    if (marks.bold) {
      rules.push(
        markInputRule({
          find: /(?:^|\s)(\*\*(?!\s)([^\s*][^*]*?)\*\*)$/,
          type: marks.bold,
        }),
        markInputRule({
          find: /(?:^|\s)(__(?!\s)([^\s_][^_]*?)__)$/,
          type: marks.bold,
        }),
      );
    }

    if (marks.italic) {
      rules.push(
        markInputRule({
          find: /(?:^|\s)(\*(?!\s)([^\s*][^*]*?)\*)$/,
          type: marks.italic,
        }),
        markInputRule({
          find: /(?:^|\s)(_(?!\s)([^\s_][^_]*?)_)$/,
          type: marks.italic,
        }),
      );
    }

    if (marks.strike) {
      rules.push(
        markInputRule({
          find: /(?:^|\s)(~~(?!\s)([^\s~][^~]*?)~~)$/,
          type: marks.strike,
        }),
      );
    }

    if (marks.code) {
      rules.push(
        markInputRule({
          find: /(`(?!\s)([^`\s][^`]*?)`)$/,
          type: marks.code,
        }),
      );
    }

    if (marks.link) {
      rules.push(
        markInputRule({
          find: /\[([^\]\s]+)\]\(([^)\s]+)\)$/,
          type: marks.link,
          getAttributes: (match) => ({ href: match[2] }),
        }),
      );
    }

    return rules;
  },
});

export function CollaborativeEditor({
  docId,
  initialContent,
  userId,
  userName,
  cursorColor,
  onSave,
}: Props) {
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
      StarterKit.configure({
        // @ts-ignore - Tiptap v3 API differences
        history: false,
      }),
      Placeholder.configure({
        placeholder: "开始写作… 支持 Markdown 快捷输入",
      }),
      // MarkdownInput 必须在 Collaboration 之前，确保 input rules 优先处理
      MarkdownInput,
      // 行内 markdown (粗体/斜体/删除线/行内代码/链接) 同样需要在 Collaboration 之前
      InlineMarkdown,
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
    const content = editor.getText();
    onSave(content);
    savedRef.current = true;
  }, [editor, onSave]);

  return (
    <div className="flex flex-col h-full">
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
}
