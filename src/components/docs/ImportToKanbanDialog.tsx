"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, ListChecks, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useBoardStore } from "@/store/board";
import type { Priority, Task } from "@/types";

interface ChecklistItem {
  sectionKey: string;
  text: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  documentId: string;
  documentTitle: string;
  /** 解析出的所有 checklist 项 */
  items: ChecklistItem[];
}

/**
 * 解析 Tiptap doc JSON 里的 checklist 项
 * 简化版:不引入 Tiptap 依赖,直接对 JSON 走一遍
 * - 找 type === "taskList" 的节点,递归找 type === "taskItem" 的子节点
 * - 从 taskItem 里提取纯文本(去掉所有 inline marks)
 */
function parseChecklistFromDocJson(doc: any): ChecklistItem[] {
  if (!doc || typeof doc !== "object") return [];
  const out: ChecklistItem[] = [];
  // 递归走节点树
  function walk(node: any, currentSection: string) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, currentSection);
      return;
    }
    const type = node.type;
    if (type === "heading") {
      // 改当前 section 名(取第一个 text 节点)
      const t = extractText(node);
      if (t) walkNext = t;
    }
    if (type === "taskList") {
      // 进入 taskList,保留最近一个 heading 的 section 名
      for (const child of node.content ?? []) walk(child, walkNext || currentSection);
      return;
    }
    if (type === "taskItem") {
      const text = extractText(node);
      if (text && text.trim()) {
        out.push({ sectionKey: walkNext || currentSection || "未分类", text: text.trim() });
      }
      return;
    }
    // 默认:递归
    if (node.content) walk(node.content, currentSection);
  }
  let walkNext = "";
  walk(doc, "");
  return out;
}

function extractText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.text) return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map(extractText).join("");
  }
  return "";
}

/**
 * 导入 checklist 到看板的对话框
 * - 显示将要创建的父任务 + 子任务预览
 * - 默认只导入「验收标准」section(更聚焦),可选"全部 section"
 * - 幂等:BE 检测到重复会跳过
 */
export function ImportToKanbanDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  items,
}: Props) {
  const upsertTasks = useBoardStore((s) => s.upsertTasks);
  const [scope, setScope] = useState<"acceptance" | "all">("acceptance");
  const [priority, setPriority] = useState<Priority>("med");
  const [submitting, setSubmitting] = useState(false);

  // 默认 scope=acceptance 时,只显示「验收标准」section 的项
  // 简化:把"验收标准"作为关键词,凡是 sectionKey 包含这个串就当它是 acceptance
  const ACCEPTANCE_KEY = "验收";

  const filteredItems =
    scope === "acceptance"
      ? items.filter((it) => it.sectionKey.includes(ACCEPTANCE_KEY))
      : items;

  // 提交
  async function handleConfirm() {
    if (filteredItems.length === 0) {
      toast.error("当前 scope 下没有可导入的 checklist 项");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/documents/${documentId}/import-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: filteredItems,
          defaultPriority: priority,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "导入失败");
        return;
      }
      // 一次性 upsert 所有新任务(父 + 子)
      const all: Task[] = [data.parentTask, ...data.createdTasks].filter(Boolean);
      upsertTasks(all);
      toast.success(
        `已导入 ${data.created} 个子任务${data.skipped > 0 ? `,跳过 ${data.skipped} 个重复` : ""}`
      );
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`网络错误:${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            导入 checklist 到看板
          </DialogTitle>
          <DialogDescription>
            把「{documentTitle}」的验收项转成任务,自动建立父-子结构。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* scope 选择 */}
          <div className="space-y-1.5">
            <Label className="text-xs">导入范围</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope("acceptance")}
                className={`text-left rounded-md border-2 p-2 text-xs transition-all ${
                  scope === "acceptance"
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="font-semibold">只导「验收标准」</div>
                <div className="text-muted-foreground text-[10px]">
                  {items.filter((it) => it.sectionKey.includes(ACCEPTANCE_KEY)).length} 项 · 推荐
                </div>
              </button>
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`text-left rounded-md border-2 p-2 text-xs transition-all ${
                  scope === "all"
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="font-semibold">全部未勾选</div>
                <div className="text-muted-foreground text-[10px]">
                  {items.length} 项 · 适合写得很细的 spec
                </div>
              </button>
            </div>
          </div>

          {/* priority 选择 */}
          <div className="space-y-1.5">
            <Label className="text-xs">默认优先级</Label>
            <div className="flex gap-1">
              {(["low", "med", "high"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 rounded-md border-2 px-2 py-1 text-xs transition-all ${
                    priority === p
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {p === "low" ? "低" : p === "med" ? "中" : "高"}
                </button>
              ))}
            </div>
          </div>

          {/* 预览 */}
          <div className="space-y-1.5">
            <Label className="text-xs">预览({filteredItems.length} 项)</Label>
            <div className="rounded-md border bg-slate-50 max-h-48 overflow-y-auto p-2 space-y-1">
              {/* 父任务预览 */}
              {filteredItems.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 pb-1 border-b">
                  <ListChecks className="h-3 w-3" />
                  父任务:{documentTitle}
                </div>
              )}
              {filteredItems.length === 0 ? (
                <div className="text-[11px] text-muted-foreground text-center py-2">
                  这个范围下没有可导入的项
                </div>
              ) : (
                filteredItems.map((it, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 text-[11px] pl-2 py-0.5"
                  >
                    <CheckCircle2 className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground shrink-0">[{it.sectionKey}]</span>
                    <span className="flex-1 min-w-0 break-words">{it.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={submitting || filteredItems.length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                导入中…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-1" />
                确认导入 {filteredItems.length} 项
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 重新导出工具函数,DocPanel 里 import
export { parseChecklistFromDocJson };
