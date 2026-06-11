"use client";

/**
 * EditWorkspaceDialog — 编辑项目信息(项目名 / 背景 / 目标 / 非目标 / 技术栈)
 *
 * 跟 CreateWorkspaceWizard 共用同一份 schema,但 4 步压成 1 屏:
 *   - 编辑场景下用户已经知道项目是啥,不需要分步引导
 *   - 改完点"保存" → PATCH /api/workspaces/:id → 通知 onSaved
 *
 * 注意:
 *   - 任何登录用户都能编辑(3 人平等,Q6 定的)
 *   - 背景(name+background)是 schema 必填,前端给校验
 *   - 关闭时不弹"二次确认"(没改就不报)
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Settings,
  Loader2,
  Check,
  X,
  Plus,
  Save,
  Target,
  Ban,
  Code2,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TECH_STACK_SUGGESTIONS, makeTechTag, parseTechTag, type TechKind, type Workspace } from "@/types";
import { wsFetch } from "@/lib/wsFetch";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 要编辑的 workspace(外面传完整对象进来,我们拉取各字段) */
  workspace: Workspace | null;
  /** 保存成功回调 — 让父组件更新 store */
  onSaved: (w: Workspace) => void;
}

/**
 * 检测字符串是否"全是 ASCII 替代字符"(迁移 bug 的指纹)
 *
 * 历史:scripts/migrate-to-workspaces.ts 跑迁移时,老 project_settings 表里
 * 的中文 background / goals 字段用 latin1 解码,导致 UTF-8 中文 byte 全部变成
 * `?` 字符(每 3 byte 中文 → 3 个 `?`)。结果 DB 里 background = "3 ????????"、
 * goals = ["??????"] 这种。
 *
 * 这种情况不能直接渲染(用户看着以为是 UI 错,实际是数据烂了),
 * 也不要去 dedupe 当成有效字符串 — 当成空值,让用户重填。
 */
function isGarbled(s: string | null | undefined): boolean {
  if (!s) return false;
  // 全是 ASCII 0x3F('?')字符,或者包含连续 3+ 个 '?' 的字符段(常见中文 3 字节)
  return /^[\x3f]+$/.test(s);
}

function cleanGarbledString(s: string | null | undefined): string {
  if (isGarbled(s)) return "";
  return s ?? "";
}

function cleanGarbledList(arr: string[] | null | undefined): string[] {
  if (!arr) return [];
  return arr.filter((x) => !isGarbled(x));
}

export function EditWorkspaceDialog({ open, onOpenChange, workspace, onSaved }: Props) {
  const [name, setName] = useState("");
  const [background, setBackground] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [nonGoals, setNonGoals] = useState<string[]>([]);
  const [techStack, setTechStack] = useState<string[]>([]);
  const [goalInput, setGoalInput] = useState("");
  const [nonGoalInput, setNonGoalInput] = useState("");
  const [techInput, setTechInput] = useState("");
  // 技术栈分桶:每列独立 input,避免"全局 input 没法分类"
  const [techInputF, setTechInputF] = useState("");
  const [techInputB, setTechInputB] = useState("");
  const [saving, setSaving] = useState(false);

  // 每次打开 / 切换 workspace → 用 ws 数据填表单
  useEffect(() => {
    if (!open || !workspace) return;
    // 4 个字符串/数组字段都做一遍 garbled 清洗(防御性,迁移期老数据)
    const cleanedBg = cleanGarbledString(workspace.background);
    const cleanedGoals = cleanGarbledList(workspace.goals);
    const cleanedNonGoals = cleanGarbledList(workspace.nonGoals);
    // 名字(kanban-team 是 ASCII)如果 garbled 也清掉
    const cleanedName = cleanGarbledString(workspace.name) || workspace.name;
    // techStack 即使 garbled 也不能 mask 掉 — ASCII 标签应该没事
    setName(cleanedName);
    setBackground(cleanedBg);
    setGoals(cleanedGoals);
    setNonGoals(cleanedNonGoals);
    setTechStack(workspace.techStack ?? []);
    setGoalInput("");
    setNonGoalInput("");
    setTechInput("");
    setTechInputF("");
    setTechInputB("");
  }, [open, workspace]);

  function addToList(
    list: string[],
    v: string,
    setInput: (s: string) => void
  ): string[] {
    // 复用同名函数,这里只给 goals/nonGoals 用 — techStack 走 makeTechTag
    const x = v.trim();
    if (!x) return list;
    if (list.includes(x)) {
      toast.info("已经存在了");
      return list;
    }
    setInput("");
    return [...list, x];
  }

  /** 技术栈专用:addToList + makeTechTag(在前/后 input 框用) */
  function addTech(v: string, kind: "frontend" | "backend" = "frontend", clear: () => void): string[] {
    const tagged = makeTechTag(v, kind);
    if (!tagged) return techStack;
    if (techStack.includes(tagged)) {
      toast.info("已经存在了");
      return techStack;
    }
    clear();
    return [...techStack, tagged];
  }

  function canSave(): boolean {
    return name.trim().length > 0 && background.trim().length > 0;
  }

  async function handleSave() {
    if (!workspace) return;
    if (!canSave()) {
      toast.error("项目名和背景必填");
      return;
    }
    setSaving(true);
    try {
      const r = await wsFetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          background: background.trim(),
          goals,
          nonGoals,
          techStack,
        },
      });
      const data = await r.json();
      if (!data.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      toast.success("已保存");
      onSaved(data.workspace);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`网络错误: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  if (!workspace) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-slate-600" />
            项目设置 · {workspace.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 项目名 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" />
              项目名 *
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="简短好记的项目名"
              className="h-9 text-sm"
              maxLength={200}
            />
          </div>

          {/* 背景 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" />
              项目背景 *
            </Label>
            <Textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="团队对齐 + AI 上下文都靠这个"
              rows={4}
              className="text-sm resize-none"
              maxLength={5000}
            />
            <p className="text-[10px] text-muted-foreground">
              {background.length} / 5000
            </p>
          </div>

          {/* 目标 + 非目标(并排两列) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 目标 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Target className="h-3 w-3 text-emerald-600" /> 项目目标
              </Label>
              <ListEditor
                list={goals}
                input={goalInput}
                setInput={setGoalInput}
                onAdd={(v) => {
                  setGoals((prev) => addToList(prev, v, setGoalInput));
                }}
                onRemove={(g) =>
                  setGoals((prev) => prev.filter((x) => x !== g))
                }
                color="emerald"
                placeholder="回车添加目标"
              />
            </div>

            {/* 非目标 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Ban className="h-3 w-3 text-rose-600" /> 明确不做
              </Label>
              <ListEditor
                list={nonGoals}
                input={nonGoalInput}
                setInput={setNonGoalInput}
                onAdd={(v) => {
                  setNonGoals((prev) => addToList(prev, v, setNonGoalInput));
                }}
                onRemove={(g) =>
                  setNonGoals((prev) => prev.filter((x) => x !== g))
                }
                color="rose"
                placeholder="回车添加非目标"
              />
            </div>
          </div>

          {/* 技术栈 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <Code2 className="h-3 w-3 text-blue-600" /> 技术栈(分前端 / 后端)
            </Label>

            {(() => {
              // 按 kind 分桶
              const buckets: Record<TechKind, string[]> = {
                frontend: [], backend: [], tool: [], unknown: [],
              };
              for (const t of techStack) buckets[parseTechTag(t).kind].push(t);
              const columns: Array<{
                kind: "frontend" | "backend";
                title: string;
                borderClass: string;
                bgClass: string;
                textClass: string;
                presetKey: keyof typeof TECH_STACK_SUGGESTIONS;
                input: string;
                setInput: (s: string) => void;
              }> = [
                {
                  kind: "frontend",
                  title: "前端",
                  borderClass: "border-blue-200",
                  bgClass: "bg-blue-50/50",
                  textClass: "text-blue-700",
                  presetKey: "frontend",
                  input: techInputF,
                  setInput: setTechInputF,
                },
                {
                  kind: "backend",
                  title: "后端",
                  borderClass: "border-emerald-200",
                  bgClass: "bg-emerald-50/50",
                  textClass: "text-emerald-700",
                  presetKey: "backend",
                  input: techInputB,
                  setInput: setTechInputB,
                },
              ];
              return (
                <div className="grid grid-cols-2 gap-2">
                  {columns.map((col) => {
                    const items = buckets[col.kind];
                    const presets = TECH_STACK_SUGGESTIONS[col.presetKey].filter(
                      (p) => !techStack.includes(makeTechTag(p, col.kind))
                    );
                    return (
                      <div
                        key={col.kind}
                        className={`rounded-md border ${col.borderClass} ${col.bgClass} p-2 space-y-1.5`}
                      >
                        <div className={`text-[11px] font-semibold ${col.textClass}`}>
                          {col.title} ({items.length})
                        </div>
                        <div className="flex flex-wrap gap-1 min-h-[28px] rounded border bg-white/60 p-1">
                          {items.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground italic self-center">
                              还没选
                            </span>
                          ) : (
                            items.map((t) => (
                              <span
                                key={t}
                                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${col.textClass} ${col.bgClass} ${col.borderClass}`}
                              >
                                {parseTechTag(t).name}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTechStack((prev) => prev.filter((x) => x !== t))
                                  }
                                  className="ml-0.5 hover:text-rose-600"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                        {/* 每列自己的输入框 — 在哪列输就归哪类 */}
                        <div className="flex gap-1">
                          <Input
                            value={col.input}
                            onChange={(e) => col.setInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                setTechStack((prev) => addTech(col.input, col.kind, () => col.setInput("")));
                              }
                            }}
                            placeholder={`加${col.title}标签…`}
                            className="h-7 text-xs"
                            maxLength={100}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={() => setTechStack((prev) => addTech(col.input, col.kind, () => col.setInput("")))}
                            disabled={!col.input.trim()}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        {presets.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {presets.slice(0, 5).map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() =>
                                  setTechStack((prev) => addTech(p, col.kind, () => col.setInput("")))
                                }
                                className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 hover:border-blue-300 hover:text-blue-700"
                              >
                                <Plus className="h-2.5 w-2.5" />
                                {p}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {(() => {
              const unknown = techStack.filter((t) => parseTechTag(t).kind === "unknown");
              if (unknown.length === 0) return null;
              return (
                <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
                  ⚠️ {unknown.length} 条没打前缀(老数据),默认归到"前端":{" "}
                  {unknown.map((t) => parseTechTag(t).name).join("、")}
                </div>
              );
            })()}

            {(() => {
              const toolItems = techStack.filter((t) => parseTechTag(t).kind === "tool");
              if (toolItems.length === 0) return null;
              return (
                <div className="rounded border border-amber-200 bg-amber-50/50 p-2">
                  <div className="text-[11px] font-semibold text-amber-700 mb-1">
                    通用工具({toolItems.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {toolItems.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[10px] font-medium"
                      >
                        {parseTechTag(t).name}
                        <button
                          type="button"
                          onClick={() =>
                            setTechStack((prev) => prev.filter((x) => x !== t))
                          }
                          className="ml-0.5 hover:text-rose-600"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* 底部 */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !canSave()}
          >
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" /> 保存中…
              </>
            ) : (
              <>
                <Save className="h-3 w-3 mr-1" /> 保存
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── 通用 list 编辑器(目标 / 非目标) ── */
function ListEditor({
  list,
  input,
  setInput,
  onAdd,
  onRemove,
  color,
  placeholder,
}: {
  list: string[];
  input: string;
  setInput: (s: string) => void;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  color: "emerald" | "rose";
  placeholder: string;
}) {
  const itemBg = color === "emerald" ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200";
  return (
    <div className="space-y-1">
      <div className={`space-y-1 rounded-md border ${itemBg} p-2 min-h-[40px]`}>
        {list.length === 0 ? (
          <div className="text-[10px] text-muted-foreground italic">还没添加</div>
        ) : (
          list.map((g) => (
            <div
              key={g}
              className="flex items-center gap-1.5 text-xs bg-white rounded border px-2 py-1"
            >
              <span className="flex-1 break-words">{g}</span>
              <button
                type="button"
                onClick={() => onRemove(g)}
                className="text-muted-foreground hover:text-rose-500"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-1">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd(input);
            }
          }}
          placeholder={placeholder}
          className="h-7 text-xs"
          maxLength={500}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => onAdd(input)}
          disabled={!input.trim()}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
