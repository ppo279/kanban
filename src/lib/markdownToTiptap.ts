// Markdown → Tiptap JSON 转换器
//
// 目的:把 AI 生成的 markdown(从 /api/ai/generate 拿到的字符串)
//     转成 Tiptap ProseMirror JSON,塞进 CollaborativeEditor。
//
// 设计:
// - 内部用 marked lexer 把 md 切成 tokens(heading/paragraph/list/code/...)
// - 逐 token 转 Tiptap 节点,失败的 token fallback 成纯文本段落
// - 支持的语法:# / ## / ### 标题,** / * / ~~ / `code` 行内 mark,
//   - / * / 1. 列表,- [ ] / - [x] 任务清单,``` 代码块,> 引用,--- 水平线
// - 不支持的(表格、嵌套 HTML、脚注)→ fallback 到 text,不报错
//
// 为什么用 marked 而不是 micromark / remark:
// - 我们要 Tiptap JSON,不是 HTML;marked 的 lexer API 直接给结构化 token
// - marked 18KB gz,够小
// - 我们用不到 remark 的扩展生态(那是给 rehype 拼装用的)

import { marked, type Tokens } from "marked";

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/** 把 markdown 字符串转成 Tiptap ProseMirror JSON doc */
export function markdownToTiptap(md: string): TiptapNode {
  // marked.lexer 是同步切 token 的 API,不需要再调 marked.parse(那个会输出 HTML)
  const tokens = marked.lexer(md ?? "");
  const content: TiptapNode[] = [];

  for (const tok of tokens) {
    const node = convertToken(tok);
    if (node) {
      if (Array.isArray(node)) {
        content.push(...node);
      } else {
        content.push(node);
      }
    }
  }
  // 至少给一个空段落,避免空 doc 在 Tiptap 里渲染异常
  if (content.length === 0) {
    content.push({ type: "paragraph" });
  }
  return { type: "doc", content };
}

function convertToken(tok: Tokens.Generic): TiptapNode | TiptapNode[] | null {
  switch (tok.type) {
    case "heading": {
      const t = tok as Tokens.Heading;
      return {
        type: "heading",
        attrs: { level: Math.min(6, Math.max(1, t.depth)) },
        content: parseInline(t.text),
      };
    }
    case "paragraph": {
      const t = tok as Tokens.Paragraph;
      return {
        type: "paragraph",
        content: parseInline(t.text),
      };
    }
    case "blockquote": {
      const t = tok as Tokens.Blockquote;
      // 嵌套 blockquote 暂时拍平:把 quote 里的 tokens 转成 paragraph
      const inner: TiptapNode[] = [];
      for (const child of t.tokens ?? []) {
        const node = convertToken(child);
        if (node) {
          if (Array.isArray(node)) inner.push(...node);
          else inner.push(node);
        }
      }
      return {
        type: "blockquote",
        content: inner.length > 0 ? inner : [{ type: "paragraph" }],
      };
    }
    case "code": {
      const t = tok as Tokens.Code;
      return {
        type: "codeBlock",
        attrs: { language: t.lang || null },
        content: [{ type: "text", text: t.text }],
      };
    }
    case "hr": {
      return { type: "horizontalRule" };
    }
    case "list": {
      const t = tok as Tokens.List;
      const isOrdered = t.ordered;
      const items: TiptapNode[] = [];
      for (const item of t.items) {
        items.push(convertListItem(item, isOrdered));
      }
      return {
        type: isOrdered ? "orderedList" : "bulletList",
        content: items,
      };
    }
    case "space": {
      // 空行,跳过(ProseMirror 段落之间不需要空节点)
      return null;
    }
    case "table": {
      // 表格暂时拍平:每个 cell 当一段
      const t = tok as Tokens.Table;
      const out: TiptapNode[] = [];
      for (const row of t.rows ?? []) {
        for (const cell of row) {
          out.push({
            type: "paragraph",
            content: parseInline(cell.text),
          });
        }
      }
      return out;
    }
    case "html": {
      // AI 偶尔会吐 HTML 标签,直接拍成空段(避免 Tiptap 解析炸)
      const t = tok as Tokens.HTML;
      if (!t.text?.trim()) return null;
      return { type: "paragraph", content: [{ type: "text", text: t.text }] };
    }
    default: {
      // 兜底:把整个 token 的 raw 转成文本段
      const t = tok as Tokens.Generic & { raw?: string; text?: string };
      const text = t.text ?? t.raw ?? "";
      if (!text) return null;
      return { type: "paragraph", content: [{ type: "text", text }] };
    }
  }
}

function convertListItem(item: Tokens.ListItem, _ordered: boolean): TiptapNode {
  // taskList (- [ ] / - [x]) 的特征:item.text 开头是 "[ ]" 或 "[x]"
  // 我们要复用现有 tiptap-task-list 扩展生成的 taskItem 节点结构
  const m = item.text.match(/^\[([ xX])\]\s*(.*)$/);
  if (m) {
    return {
      type: "taskItem",
      attrs: { done: m[1] !== " ", taskId: null },
      content: [
        {
          type: "paragraph",
          content: parseInline(m[2]),
        },
      ],
    };
  }
  return {
    type: "listItem",
    content: [
      {
        type: "paragraph",
        content: parseInline(item.text),
      },
    ],
  };
}

/** 解析行内 markdown 语法: **bold** *italic* ~~strike~~ `code` [text](url) */
function parseInline(text: string): TiptapNode[] {
  if (!text) return [];
  // 把行内语法切出来 — 用一个简易状态机避免 regex 贪心误判
  const nodes: TiptapNode[] = [];
  let i = 0;
  let buf = "";

  const flush = () => {
    if (buf) {
      nodes.push({ type: "text", text: buf });
      buf = "";
    }
  };

  while (i < text.length) {
    // **bold** 或 __bold__
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        const inner = text.slice(i + 2, end);
        if (inner) {
          flush();
          nodes.push({ type: "text", text: inner, marks: [{ type: "bold" }] });
          i = end + 2;
          continue;
        }
      }
    }
    // ~~strike~~
    if (text[i] === "~" && text[i + 1] === "~") {
      const end = text.indexOf("~~", i + 2);
      if (end > i + 2) {
        const inner = text.slice(i + 2, end);
        if (inner) {
          flush();
          nodes.push({ type: "text", text: inner, marks: [{ type: "strike" }] });
          i = end + 2;
          continue;
        }
      }
    }
    // *italic* 或 _italic_
    if (text[i] === "*" || text[i] === "_") {
      const ch = text[i];
      const end = text.indexOf(ch, i + 1);
      if (end > i + 1) {
        const inner = text.slice(i + 1, end);
        if (inner) {
          flush();
          nodes.push({ type: "text", text: inner, marks: [{ type: "italic" }] });
          i = end + 1;
          continue;
        }
      }
    }
    // `code`
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        const inner = text.slice(i + 1, end);
        if (inner) {
          flush();
          nodes.push({ type: "text", text: inner, marks: [{ type: "code" }] });
          i = end + 1;
          continue;
        }
      }
    }
    // [text](url)
    if (text[i] === "[") {
      const close = text.indexOf("]", i + 1);
      if (close > i + 1 && text[close + 1] === "(") {
        const urlEnd = text.indexOf(")", close + 2);
        if (urlEnd > close + 2) {
          const linkText = text.slice(i + 1, close);
          const url = text.slice(close + 2, urlEnd);
          if (linkText && url) {
            flush();
            nodes.push({
              type: "text",
              text: linkText,
              marks: [{ type: "link", attrs: { href: url } }],
            });
            i = urlEnd + 1;
            continue;
          }
        }
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return nodes;
}
