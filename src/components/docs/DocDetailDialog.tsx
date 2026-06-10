"use client";

/**
 * DocDetailDialog — 文档详情弹层(只读 modal)
 *
 * 触发方式:
 *   window.dispatchEvent(new CustomEvent("kanban:view-doc", { detail: { docId } }))
 *
 * 设计原则:
 *   - 用 z-index 50 + portal,确保叠在所有其他 dialog 之上(看板主区 dialog 默认 z-50)
 *   - 内容用 Tiptap editable=false 渲染,跟侧栏编辑器视觉一致
 *   - 顶部一个「在编辑器中打开」按钮,fire `kanban:open-doc` 让侧栏接走编辑态
 *   - 文档为空时显占位,不报红
 *
 * 为什么不复用 CollaborativeEditor?
 *   CollaborativeEditor 强制走 Y.Doc + websocket 协作,弹层只是看一眼就用这个太重。
 *   这里走一份只读 Tiptap 实例,无协作、无 toolbar、无 input rules,只渲染。
 */

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Heading } from "@tiptap/extension-heading";
import { Bold } from "@tiptap/extension-bold";
import { Italic } from "@tiptap/extension-italic";
import { Strike } from "@tiptap/extension-strike";
import { Code } from "@tiptap/extension-code";
import { CodeBlock } from "@tiptap/extension-code-block";
import { Blockquote } from "@tiptap/extension-blockquote";
import { BulletList, OrderedList } from "@tiptap/extension-list";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { Link } from "@tiptap/extension-link";
import { TaskList, TaskItem } from "@/lib/tiptap-task-list";
import { X, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/util";
import { DOC_MODE_LABEL, DOC_MODE_COLOR, type DocMode, type Document } from "@/types";

/**
 * 全局 modal portal — 跟 ui/dialog.tsx 一样 z-index 50
 * 但因为是文档详情,层级可能要叠在 TaskDetailDialog 之上,
 * 所以这里用 z-[60]
 */
function Portal({ children }: { children: React.ReactNode }) {
  if (typeof window === "undefined") return null;
  return <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">{children}</div>;
}

export function DocDetailDialog() {
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ── 监听全局事件 ──
  useEffect(() => {
    const onView = async (e: Event) => {
      const ce = e as CustomEvent<{ docId: string }>;
      const docId = ce.detail?.docId;
      if (!docId) return;
      // 已经是同一个 doc,跳过重新拉
      if (doc?.id === docId && open) return;
      setOpen(true);
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/documents/${docId}`, { credentials: "include" });
        const data = await r.json();
        if (!data.ok || !data.document) {
          setErr(data.error ?? "加载失败");
          setDoc(null);
          return;
        }
        setDoc(data.document as Document);
      } catch (e: any) {
        setErr(`网络错误: ${e?.message ?? e}`);
      } finally {
        setLoading(false);
      }
    };
    window.addEventListener("kanban:view-doc", onView);
    return () => window.removeEventListener("kanban:view-doc", onView);
  }, [doc?.id, open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // ── 只读 Tiptap 实例 ──
  const editor = useEditor(
    {
      editable: false,
      content: doc?.content ? safeParse(doc.content) : "",
      extensions: [
        StarterKit.configure({
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
        Heading,
        Bold,
        Italic,
        Strike,
        Code,
        CodeBlock,
        Blockquote,
        BulletList,
        OrderedList,
        HorizontalRule,
        Link.configure({ openOnClick: false, autolink: false }),
        TaskList,
        TaskItem,
      ],
      editorProps: {
        attributes: {
          class: "prose prose-sm max-w-none focus:outline-none",
        },
      },
      immediatelyRender: false,
    },
    [doc?.id] // 切 doc 时重建实例
  );

  function openInSidePanel() {
    if (!doc) return;
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("kanban:open-doc", { detail: { docId: doc.id } })
    );
  }

  if (!open) return null;

  return (
    <Portal>
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* dialog shell */}
      <div
        className="relative w-full max-w-3xl max-h-[85vh] rounded-lg border bg-card text-card-foreground shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <header className="flex items-center gap-2 border-b px-4 py-3 shrink-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold truncate">
                {doc?.title ?? (loading ? "加载中…" : "未命名文档")}
              </h2>
              {doc && (
                <span
                  className={cn(
                    "shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium",
                    DOC_MODE_COLOR[doc.mode as DocMode]
                  )}
                >
                  {DOC_MODE_LABEL[doc.mode as DocMode]}
                </span>
              )}
            </div>
            {doc && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                最后更新 {new Date(doc.updatedAt).toLocaleString("zh-CN")}
              </p>
            )}
          </div>

          {doc && (
            <Button
              variant="outline"
              size="sm"
              onClick={openInSidePanel}
              className="h-7 text-xs"
              title="关闭弹层,打开侧栏编辑"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              在编辑器中打开
            </Button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted shrink-0"
            title="关闭 (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          )}
          {err && !loading && (
            <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 p-3 text-xs">
              {err}
            </div>
          )}
          {!loading && !err && editor && doc && (
            <EditorContent editor={editor} />
          )}
          {!loading && !err && doc && !doc.content && (
            <div className="text-center text-xs text-muted-foreground py-12">
              文档还没有内容
            </div>
          )}
        </div>

        {/* footer(只读 modal 不需要保存按钮,但留个 ESC 提示) */}
        <footer className="flex items-center justify-between border-t px-4 py-2 text-[10px] text-muted-foreground shrink-0">
          <span>只读视图 · 协作编辑请在右侧编辑器中打开</span>
          <span>ESC 关闭</span>
        </footer>
      </div>
    </Portal>
  );
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    // content 不是 Tiptap JSON,降级当纯文本
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: s }],
        },
      ],
    };
  }
}