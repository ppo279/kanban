"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Code2,
  ListChecks,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/util";
import { detectSpecCandidates, type Candidate, type InterfaceCandidate, type ChecklistCandidate } from "@/lib/specDetector";
import { useBoardStore } from "@/store/board";
import { wsFetch } from "@/lib/wsFetch";
import type { TiptapNode } from "@/lib/specDetector";
import type { HttpMethod } from "@/types";

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

interface Props {
  documentId: string;
  /** 当前 doc 的 Tiptap JSON(可以 null) */
  docJson: TiptapNode | null;
  /** Editor handle 的命令式 API — 用来给源节点打标 / 高亮 */
  markCodeBlockConverted: (hash: string, entityId: string) => boolean;
  markTaskItemConverted: (text: string, taskId: string, sectionKey: string) => boolean;
  highlightSource: (kind: "interface" | "checklist", hash: string) => boolean;
}

/**
 * 「🆕 待审」section
 * - 自动扫描 spec 文档,发现 JSON 代码块 + 验收 checklist
 * - 用户可编辑每个候选(改名字 / mock 响应)
 * - 「全部应用」或「应用选中的」一次性提交
 * - 应用后,给源节点打 data-converted / data-task-id,下次不再提
 */
export function PendingReviewPanel({
  documentId,
  docJson,
  markCodeBlockConverted,
  markTaskItemConverted,
  highlightSource,
}: Props) {
  const upsertTasks = useBoardStore((s) => s.upsertTasks);

  // 候选列表(从 docJson 算出来)
  const candidates = useMemo(
    () => detectSpecCandidates(docJson),
    [docJson]
  );

  // 选中哪些(默认全选)
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // 编辑中的候选项 index
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  // 草稿(编辑时)
  const [editDraft, setEditDraft] = useState<any>(null);
  // 已"完成"的本地编辑 — Map<candidateIdx, editedProposed> — 提交后保留到下一次候选变化
  // 之前 commitEdit 清空 editingIdx 但 editDraft 一起丢了,applySelected 只看 editingIdx === cIdx,导致点"完成"再点"应用"会丢用户编辑
  const [committedEdits, setCommittedEdits] = useState<Map<number, any>>(
    new Map()
  );

  // 候选变化时清掉越界的 committedEdits(index 会随 doc 变化失效)
  useEffect(() => {
    setCommittedEdits((prev) => {
      const next = new Map<number, any>();
      for (const [k, v] of prev.entries()) {
        if (k < candidates.length) next.set(k, v);
      }
      return next;
    });
  }, [candidates]);
  // 折叠状态
  const [ifaceOpen, setIfaceOpen] = useState(true);
  const [checkOpen, setCheckOpen] = useState(true);
  // 全部忽略(session 内不再展示)
  const [dismissed, setDismissed] = useState(false);
  // 提交中
  const [submitting, setSubmitting] = useState(false);

  // 候选变化时,默认全选新增的 index,清理越界的旧 index
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<number>();
      for (let i = 0; i < candidates.length; i++) {
        // 之前被勾过 → 保留;新增 → 看 confidence 决定是否默认勾
        if (prev.has(i)) {
          next.add(i);
        } else if (candidates[i].confidence !== "low") {
          next.add(i);
        }
      }
      return next;
    });
  }, [candidates]);

  // 跳到看板的任务(已应用的 checklist)
  const [appliedTaskIds, setAppliedTaskIds] = useState<string[]>([]);
  const [appliedIfaceIds, setAppliedIfaceIds] = useState<string[]>([]);

  const interfaceCandidates = candidates.filter(
    (c): c is InterfaceCandidate => c.kind === "interface"
  );
  const checklistCandidates = candidates.filter(
    (c): c is ChecklistCandidate => c.kind === "checklist"
  );

  // 没东西可审 — 隐藏
  if (dismissed || candidates.length === 0) {
    if (dismissed) return null;
    // 没候选,什么都不显示(但不占空间,留 0 高度)
    return null;
  }

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function startEdit(idx: number) {
    const c = candidates[idx];
    if (c.kind === "interface") {
      setEditDraft({ ...c.proposed });
    } else {
      setEditDraft({ ...c.proposed });
    }
    setEditingIdx(idx);
  }

  function commitEdit() {
    if (editingIdx === null || !editDraft) return;
    // 把草稿存到 committedEdits 而不是丢,让 applySelected 还能拿到
    setCommittedEdits((prev) => {
      const next = new Map(prev);
      next.set(editingIdx, editDraft);
      return next;
    });
    setEditingIdx(null);
    setEditDraft(null);
    toast.success("已编辑(未保存,点「应用」才生效)");
  }

  async function applySelected() {
    if (selected.size === 0) {
      toast.error("至少勾一个");
      return;
    }
    setSubmitting(true);
    try {
      // 分组:interfaces 走 /api/spec-interfaces,checklists 走 import-tasks
      const selectedInterfaces: InterfaceCandidate[] = [];
      const selectedChecklists: ChecklistCandidate[] = [];
      for (const idx of selected) {
        const c = candidates[idx];
        if (c.kind === "interface") selectedInterfaces.push(c);
        else selectedChecklists.push(c);
      }

      const newIfaceIds: string[] = [];
      const newTaskIds: string[] = [];

      // 1. 创建 spec_interfaces(并行)
      const ifaceResults = await Promise.allSettled(
        selectedInterfaces.map(async (c) => {
          // 优先级:正在编辑(editDraft) > 已完成未应用的编辑(committedEdits) > 原始 proposed
          const cIdx = candidates.indexOf(c);
          const liveEdit =
            editingIdx === cIdx && editDraft
              ? editDraft
              : committedEdits.get(cIdx);
          const proposed = liveEdit
            ? { ...c.proposed, ...liveEdit }
            : c.proposed;
          // spec-interfaces POST:documentId 隐含 wsId(后端从 doc 反查)
          const r = await wsFetch("/api/spec-interfaces", {
            method: "POST",
            body: {
              documentId,
              method: proposed.method,
              path: proposed.path,
              name: proposed.name,
              description: proposed.description,
              mockResponse: proposed.mockResponse,
              mockStatusCode: proposed.mockStatusCode,
            },
            skipWorkspace: true,
          });
          const data = await r.json();
          if (!r.ok || !data.ok) {
            throw new Error(data.error ?? "创建失败");
          }
          return { candidate: c, interfaceId: data.interface.id };
        })
      );
      for (let i = 0; i < ifaceResults.length; i++) {
        const res = ifaceResults[i];
        const c = selectedInterfaces[i];
        if (res.status === "fulfilled") {
          newIfaceIds.push(res.value.interfaceId);
          // 标记源 codeBlock 为"已转换"
          markCodeBlockConverted(c.sourceHash, res.value.interfaceId);
        } else {
          toast.error(`接口 ${c.proposed.name}: ${res.reason?.message ?? "失败"}`);
        }
      }

      // 2. 创建 tasks(走 import-tasks 端点,一次性发所有 checklist)
      if (selectedChecklists.length > 0) {
        const items = selectedChecklists.map((c) => ({
          sectionKey: c.sectionKey,
          text: c.proposed.text,
        }));
        const r = await fetch(`/api/documents/${documentId}/import-tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ items, defaultPriority: "med" }),
        });
        const data = await r.json();
        if (!r.ok || !data.ok) {
          toast.error(`任务导入:${data.error ?? "失败"}`);
        } else {
          // 合并父 + 子任务到 store(空数组时跳过)
          const allTasks = [data.parentTask, ...(data.createdTasks || [])].filter(
            Boolean
          );
          if (allTasks.length > 0) {
            upsertTasks(allTasks);
            newTaskIds.push(...allTasks.map((t: any) => t.id));
          }
          // 标记源 taskItem — 对每个 createdTask,匹配同 title 的 taskItem
          for (const ct of data.createdTasks || []) {
            markTaskItemConverted(ct.title, ct.id, "验收标准");
          }
        }
      }

      setAppliedIfaceIds((prev) => [...prev, ...newIfaceIds]);
      setAppliedTaskIds((prev) => [...prev, ...newTaskIds]);

      const uniqueTaskCount = new Set(newTaskIds).size;
      toast.success(
        `已应用 ${newIfaceIds.length} 个接口 + ${uniqueTaskCount} 个任务`
      );
    } catch (e: any) {
      toast.error(`网络错误:${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }

  function ignore() {
    setDismissed(true);
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/40 p-2 max-h-[280px] overflow-y-auto space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <Sparkles className="h-3.5 w-3.5" />
          🆕 待审 ({candidates.length})
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-1.5 text-muted-foreground"
            onClick={ignore}
            title="本 session 不再提示(下次新建/改动会重新提示)"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Interface section */}
      {interfaceCandidates.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setIfaceOpen(!ifaceOpen)}
            className="flex items-center gap-1 text-[10px] font-semibold text-orange-700 hover:text-orange-800"
          >
            {ifaceOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Code2 className="h-3 w-3" />
            接口 ({interfaceCandidates.length})
          </button>
          {ifaceOpen && (
            <div className="space-y-1.5 pl-3">
              {interfaceCandidates.map((c, localIdx) => {
                const globalIdx = candidates.indexOf(c);
                const isSelected = selected.has(globalIdx);
                const isEditing = editingIdx === globalIdx;
                return (
                  <CandidateRow
                    key={c.sourceHash}
                    isSelected={isSelected}
                    onToggle={() => toggle(globalIdx)}
                    onHighlight={() => highlightSource("interface", c.sourceHash)}
                  >
                    {isEditing ? (
                      <div className="space-y-1">
                        <div className="grid grid-cols-[60px_1fr_1fr] gap-1">
                          <select
                            value={editDraft.method}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, method: e.target.value })
                            }
                            className="h-6 text-[10px] rounded border px-1"
                          >
                            {HTTP_METHODS.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <Input
                            value={editDraft.path}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, path: e.target.value })
                            }
                            className="h-6 text-[10px] font-mono"
                            placeholder="/api/xxx"
                          />
                          <Input
                            value={editDraft.name}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, name: e.target.value })
                            }
                            className="h-6 text-[10px]"
                            placeholder="名称"
                          />
                        </div>
                        <Input
                          value={editDraft.description ?? ""}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, description: e.target.value })
                          }
                          placeholder="描述(可选)"
                          className="h-6 text-[10px]"
                        />
                        <Textarea
                          value={editDraft.mockResponse}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, mockResponse: e.target.value })
                          }
                          rows={3}
                          className="font-mono text-[10px] resize-none"
                        />
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={editDraft.mockStatusCode}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                mockStatusCode: Number(e.target.value),
                              })
                            }
                            className="h-6 text-[10px] w-16"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingIdx(null)}
                            className="h-6 text-[10px]"
                          >
                            完成
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span
                          className={cn(
                            "shrink-0 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold text-white min-w-[30px] justify-center",
                            c.proposed.method === "GET" && "bg-emerald-500",
                            c.proposed.method === "POST" && "bg-blue-500",
                            c.proposed.method === "PUT" && "bg-amber-500",
                            c.proposed.method === "DELETE" && "bg-red-500",
                            c.proposed.method === "PATCH" && "bg-purple-500"
                          )}
                        >
                          {c.proposed.method}
                        </span>
                        <code className="font-mono text-slate-700 truncate flex-1">
                          {c.proposed.path}
                        </code>
                        <span className="text-muted-foreground truncate max-w-[120px]">
                          {c.proposed.name}
                        </span>
                        {c.confidence === "low" && (
                          <span
                            className="text-rose-500 inline-flex items-center"
                            title="置信度低,需要检查/手填"
                          >
                            <AlertCircle className="h-3 w-3" />
                          </span>
                        )}
                        {c.confidence === "medium" && (
                          <span
                            className="text-amber-500 inline-flex items-center"
                            title="可能是请求参数,需要确认 mock 响应"
                          >
                            <AlertCircle className="h-3 w-3" />
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(globalIdx)}
                          className="h-5 px-1.5 text-[9px]"
                        >
                          编辑
                        </Button>
                      </div>
                    )}
                  </CandidateRow>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Checklist section */}
      {checklistCandidates.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setCheckOpen(!checkOpen)}
            className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-800"
          >
            {checkOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <ListChecks className="h-3 w-3" />
            验收 ({checklistCandidates.length})
          </button>
          {checkOpen && (
            <div className="space-y-0.5 pl-3">
              {checklistCandidates.map((c) => {
                const globalIdx = candidates.indexOf(c);
                const isSelected = selected.has(globalIdx);
                return (
                  <CandidateRow
                    key={c.sourceHash}
                    isSelected={isSelected}
                    onToggle={() => toggle(globalIdx)}
                    onHighlight={() => highlightSource("checklist", c.sourceHash)}
                  >
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-slate-600 truncate flex-1">
                        {c.proposed.text}
                      </span>
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        [{c.sectionKey}]
                      </span>
                    </div>
                  </CandidateRow>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-1 border-t">
        <Button
          size="sm"
          variant="outline"
          onClick={applySelected}
          disabled={submitting || selected.size === 0}
          className="h-7 text-xs flex-1 bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              应用中…
            </>
          ) : (
            <>
              <Wand2 className="h-3 w-3 mr-1" />
              应用选中的 ({selected.size})
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={ignore}
          className="h-7 text-[10px] text-muted-foreground"
        >
          忽略
        </Button>
      </div>

      {/* 应用成功后的回显 */}
      {(appliedIfaceIds.length > 0 || appliedTaskIds.length > 0) && (
        <div className="rounded bg-emerald-50 border border-emerald-200 p-1.5 text-[10px] text-emerald-700 space-y-0.5">
          <div className="font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            已应用
          </div>
          {appliedIfaceIds.length > 0 && (
            <div>· {appliedIfaceIds.length} 个接口已建到「结构化接口」section</div>
          )}
          {appliedTaskIds.length > 0 && (
            <div>· {appliedTaskIds.length} 个任务已建到看板(包含父任务)</div>
          )}
        </div>
      )}
    </div>
  );
}

/** 统一的候选行(checkbox + 高亮 + 内容) */
function CandidateRow({
  isSelected,
  onToggle,
  onHighlight,
  children,
}: {
  isSelected: boolean;
  onToggle: () => void;
  onHighlight: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded border p-1.5 transition-colors",
        isSelected
          ? "border-amber-400 bg-amber-50"
          : "border-slate-200 bg-white/50 opacity-60"
      )}
    >
      <div className="flex items-start gap-1.5">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0" onMouseEnter={onHighlight}>
          {children}
        </div>
      </div>
    </div>
  );
}
