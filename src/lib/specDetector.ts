// Spec doc 主动检测 — 从 Tiptap JSON 抽出"可结构化"的内容
//
// 两种候选:
// 1. Interface: 「接口设计」section 里的 JSON 代码块
//    启发式:从代码块前面的文字 grep "METHOD /path",
//           从 JSON body 抽 mock 响应(启发式区分"请求参数"和"响应体")
// 2. Checklist: 「验收标准」section 里的 taskItem (done=false)
//
// 输出 candidates 带 sourceNodePos,调用方拿到后能精准标记源节点
// 防止重复:已经在 doc 里标记 data-converted / data-task-id 的节点会过滤掉

import type { HttpMethod } from "@/types";

/** doc JSON 的极简类型(我们只读,避免 import 整个 Tiptap 类型) */
export interface TiptapNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TiptapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: any }>;
}

export type DetectionConfidence = "high" | "medium" | "low";

export interface InterfaceCandidate {
  kind: "interface";
  /** 源节点在 ProseMirror doc 里的位置(给 collaborative editor 用) */
  sourceNodePos: number;
  /** doc 里稳定 hash — 应用后写到 data-converted,dedup 用 */
  sourceHash: string;
  /** 「接口设计」section 的标题名 */
  sectionKey: string;
  proposed: {
    method: HttpMethod;
    path: string;
    name: string;
    description: string;
    mockResponse: string;
    mockStatusCode: number;
  };
  confidence: DetectionConfidence;
  /** 原始 JSON 字符串(给 UI 折叠预览用) */
  rawJson: string;
}

export interface ChecklistCandidate {
  kind: "checklist";
  sourceNodePos: number;
  sourceHash: string;
  sectionKey: string;
  proposed: {
    text: string;
  };
  confidence: DetectionConfidence;
}

export type Candidate = InterfaceCandidate | ChecklistCandidate;

/** 一个简单的 stable hash — 用于 dedup,不需要密码学强度 */
function quickHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

/** 从一段文本里 grep "METHOD /path" */
function extractMethodAndPath(text: string): { method: HttpMethod; path: string } | null {
  // 支持 "GET /api/users"、"**GET /api/users**"、"- [ ] GET /api/users" 之类前缀
  // 也支持括号、冒号等:"GET /api/users  -"
  const m = text.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s)\]）]+)/i);
  if (!m) return null;
  const method = m[1].toUpperCase() as HttpMethod;
  if (!HTTP_METHODS.includes(method)) return null;
  return { method, path: m[2] };
}

/** 判断 JSON 是不是"响应体"风格(有 code/data 包裹) */
function looksLikeResponseBody(obj: any): boolean {
  return (
    typeof obj === "object" &&
    obj !== null &&
    (("code" in obj && ("data" in obj || "message" in obj)) ||
      Array.isArray(obj) ||
      typeof obj === "string")
  );
}

/** 判断 JSON 是不是"请求参数"风格(分页/筛选/排序等) */
function looksLikeRequestParams(obj: any): boolean {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  const requestKeys = ["page", "pageSize", "page_size", "filters", "sort", "order", "query", "params"];
  return requestKeys.some((k) => keys.includes(k));
}

/** 从 obj 抽 status code(如果像 {code: 200, ...} 这种) */
function extractStatusCode(obj: any): number {
  if (typeof obj === "object" && obj !== null && typeof obj.code === "number" && obj.code >= 100 && obj.code < 600) {
    return obj.code;
  }
  return 200;
}

/** 从 obj 抽 description — 顶层有 desc/description 就用 */
function extractDescription(obj: any): string {
  if (typeof obj === "object" && obj !== null) {
    if (typeof obj.description === "string") return obj.description;
    if (typeof obj.desc === "string") return obj.desc;
  }
  return "";
}

/** 从一段 obj 抽 mockResponse — 优先 .response / .data / 整个 obj */
function extractMockResponse(obj: any): string {
  if (typeof obj === "object" && obj !== null) {
    if (obj.response !== undefined) return JSON.stringify(obj.response, null, 2);
    if (obj.data !== undefined) return JSON.stringify(obj.data, null, 2);
    if (obj.body !== undefined) return JSON.stringify(obj.body, null, 2);
  }
  return JSON.stringify(obj, null, 2);
}

/** 抽取 text 节点的全部文本(从 children 数组) */
function extractText(node: TiptapNode | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(extractText).join("");
  }
  return "";
}

/** 从 text 里提取 section 标题(最近的 heading 节点) */
function findSectionForNode(
  flat: Array<{ type: string; node: TiptapNode; pos: number }>
): string {
  let lastHeading = "";
  for (const entry of flat) {
    if (entry.type === "heading") {
      lastHeading = extractText(entry.node).trim();
    }
    // 命中 = 这是我们要找的
  }
  return lastHeading;
}

/** 走 doc 树,展平成 [{ type, node, pos }] 的列表
 * 这里我们没法算真实 ProseMirror position(需要 editor instance),
 * 但 Tiptap 在 collaborative 模式下 NodePos 通常跟 JSON 数组下标一致,
 * 加上 relativePos(在父节点里的下标)其实更准 — DocPanel 那边用 editor.doc.descendants
 * 自己算精确 position。我们这里先用 0 占位,DocPanel 应用的时候用真实 editor 算。
 */
function flattenDoc(
  doc: TiptapNode,
  parentContent: TiptapNode[] = [],
  parentIdx = 0,
  currentSection = ""
): Array<{ type: string; node: TiptapNode; sectionKey: string; pos: number }> {
  const out: Array<{ type: string; node: TiptapNode; sectionKey: string; pos: number }> = [];
  if (!doc || !Array.isArray(doc.content)) return out;

  let section = currentSection;
  for (let i = 0; i < doc.content.length; i++) {
    const node = doc.content[i];
    if (node.type === "heading") {
      section = extractText(node).trim();
    }
    // ProseMirror position: 我们不在这里算 — DocPanel 用 editor.state.doc.resolve 算
    out.push({ type: node.type, node, sectionKey: section || "未分类", pos: -1 });
    // 递归
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        if (Array.isArray(child.content)) {
          out.push(
            ...flattenDoc(child, child.content, 0, section)
          );
        }
      }
    }
  }
  return out;
}

/** 找 JSON codeBlock 紧邻的「描述文字」:在同一个父 listItem/paragraph 里的前一个 text node */
function findPrecedingText(flat: any[], codeBlockIdx: number): string {
  // 往前找最近一个有 text 的节点
  for (let i = codeBlockIdx - 1; i >= 0; i--) {
    const e = flat[i];
    if (e.type === "codeBlock") break; // 撞到上一个 codeBlock 就停
    if (e.type === "text" || e.type === "paragraph" || e.type === "listItem") {
      const t = extractText(e.node);
      if (t.trim()) return t;
    }
  }
  return "";
}

/**
 * 检测 JSON codeBlock → interface candidate
 * @param flat flattenDoc 输出
 * @returns candidates 数组
 */
function detectInterfaceCandidates(
  flat: Array<{ type: string; node: TiptapNode; sectionKey: string; pos: number }>
): InterfaceCandidate[] {
  const out: InterfaceCandidate[] = [];
  for (let i = 0; i < flat.length; i++) {
    const e = flat[i];
    if (e.type !== "codeBlock") continue;
    // 跳过已经被标记转换的
    if (e.node.attrs?.["data-converted"]) continue;
    // 只看 JSON 代码块(允许用户写 ```javascript 等其他语言,跳过)
    if (e.node.attrs?.language && e.node.attrs.language !== "json") continue;

    const rawText = extractText(e.node);
    if (!rawText.trim()) continue;

    // 尝试 JSON.parse
    let parsed: any = null;
    let parseOk = false;
    try {
      parsed = JSON.parse(rawText);
      parseOk = true;
    } catch {
      // JSON 不合法 — 标记 low confidence,让用户手填
    }

    // 在 codeBlock 前面找描述文字(用 "METHOD /path" 提取)
    const preceding = findPrecedingText(flat, i);
    const mp = extractMethodAndPath(preceding);

    // 算 confidence
    let confidence: DetectionConfidence = "low";
    if (parseOk && mp && looksLikeResponseBody(parsed)) {
      confidence = "high";
    } else if (parseOk && mp) {
      confidence = "medium"; // JSON 是请求参数或别的什么,需要手填 mock
    } else if (mp) {
      confidence = "low"; // JSON 解析失败但有 method/path
    }

    // 草拟字段
    let method: HttpMethod = "GET";
    let path = "";
    let name = "";
    let description = "";
    let mockResponse = '{"code": 200, "data": null, "message": "ok"}';
    let mockStatusCode = 200;

    if (mp) {
      method = mp.method;
      path = mp.path;
      // 名称:从前面的文字里取,如 "**获取用户列表 API**" → "获取用户列表 API"
      name = preceding.replace(/\b(GET|POST|PUT|DELETE|PATCH)\s+\S+/, "").replace(/[*_`]+/g, "").trim();
      if (!name) name = `${method} ${path}`;
    } else {
      // 没法提取 — 留空让用户填
      name = "(需手填)";
      path = "(需手填)";
    }

    if (parseOk) {
      description = extractDescription(parsed);
      mockStatusCode = extractStatusCode(parsed);
      if (looksLikeResponseBody(parsed)) {
        mockResponse = extractMockResponse(parsed);
      } else if (looksLikeRequestParams(parsed)) {
        // 请求参数风格 — 不强猜 mock 响应,让用户手填
        mockResponse = "// 这看起来是请求参数 schema,不是 mock 响应\n// 请手填实际响应结构";
        confidence = "medium";
      }
    }

    const sourceHash = quickHash(`interface|${rawText.slice(0, 200)}`);

    out.push({
      kind: "interface",
      sourceNodePos: e.pos, // DocPanel 用真实 editor 重算
      sourceHash,
      sectionKey: e.sectionKey,
      proposed: { method, path, name, description, mockResponse, mockStatusCode },
      confidence,
      rawJson: rawText,
    });
  }
  return out;
}

/** 找「验收」section 的 taskList 下的 taskItem */
function detectChecklistCandidates(
  flat: Array<{ type: string; node: TiptapNode; sectionKey: string; pos: number }>
): ChecklistCandidate[] {
  const out: ChecklistCandidate[] = [];
  let currentSection = "未分类";

  for (let i = 0; i < flat.length; i++) {
    const e = flat[i];
    if (e.type === "heading") {
      currentSection = extractText(e.node).trim() || "未分类";
    }
    if (e.type !== "taskItem") continue;
    if (e.node.attrs?.checked === true) continue; // 已勾的不导
    if (e.node.attrs?.["data-task-id"]) continue; // 已关联 task 的不导

    const text = extractText(e.node).trim();
    if (!text) continue;

    const sourceHash = quickHash(`checklist|${text}`);

    out.push({
      kind: "checklist",
      sourceNodePos: e.pos,
      sourceHash,
      sectionKey: currentSection,
      proposed: { text },
      confidence: "high",
    });
  }
  return out;
}

/**
 * 主入口:扫描整个 doc,返回所有候选
 */
export function detectSpecCandidates(doc: TiptapNode | null | undefined): Candidate[] {
  if (!doc) return [];
  const flat = flattenDoc(doc);
  const interfaces = detectInterfaceCandidates(flat);
  const checklists = detectChecklistCandidates(flat);
  return [...interfaces, ...checklists];
}

/** 单独暴露给 UI 用 — 只看 interface */
export function detectInterfaces(doc: TiptapNode | null | undefined): InterfaceCandidate[] {
  if (!doc) return [];
  return detectInterfaceCandidates(flattenDoc(doc));
}

/** 单独暴露给 UI 用 — 只看 checklist */
export function detectChecklists(doc: TiptapNode | null | undefined): ChecklistCandidate[] {
  if (!doc) return [];
  return detectChecklistCandidates(flattenDoc(doc));
}
