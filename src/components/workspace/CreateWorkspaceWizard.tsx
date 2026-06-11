"use client";

/**
 * CreateWorkspaceWizard — 4 步新建项目向导
 *
 * 步骤:
 *   1. 项目名(必填,简短)
 *   2. 项目背景(必填,核心 - 团队对齐靠这个)
 *   3. 项目目标 + 明确不做(可选,结构化,辅助对齐 + AI context)
 *   4. 技术栈(可选,多标签)
 *
 * 走完 → POST /api/workspaces → 通知 onCreated(workspace)
 * 任一步可点 "上一步" 退回
 * 关闭按钮要二次确认(已经填了的会丢)
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  FileText,
  Target,
  Ban,
  Code2,
  X,
  Plus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/util";
import { TECH_STACK_SUGGESTIONS, makeTechTag, parseTechTag, type TechKind, type Workspace } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 创建成功回调 — 把新 ws 交给父组件 */
  onCreated: (w: Workspace) => void;
}

type Step = 1 | 2 | 3 | 4;

interface Draft {
  name: string;
  background: string;
  goals: string[];
  nonGoals: string[];
  techStack: string[];
}

const EMPTY: Draft = {
  name: "",
  background: "",
  goals: [],
  nonGoals: [],
  techStack: [],
};

const STEPS: Array<{
  n: Step;
  title: string;
  hint: string;
  icon: React.ElementType;
}> = [
  { n: 1, title: "项目名", hint: "简短好记就行", icon: FileText },
  { n: 2, title: "项目背景", hint: "团队对齐 + AI 上下文都靠这个", icon: Sparkles },
  { n: 3, title: "目标 / 非目标", hint: "可选,但写清楚能省很多返工", icon: Target },
  { n: 4, title: "技术栈", hint: "可选,多标签,任意加", icon: Code2 },
];

export function CreateWorkspaceWizard({ open, onOpenChange, onCreated }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // 三个 list 的临时 input
  const [goalInput, setGoalInput] = useState("");
  const [nonGoalInput, setNonGoalInput] = useState("");
  const [techInput, setTechInput] = useState("");

  const reset = useCallback(() => {
    setStep(1);
    setDraft(EMPTY);
    setGoalInput("");
    setNonGoalInput("");
    setTechInput("");
    setSubmitting(false);
    setConfirmClose(false);
  }, []);

  function handleOpenChange(o: boolean) {
    if (!o && hasContent()) {
      setConfirmClose(true);
      return;
    }
    if (!o) reset();
    onOpenChange(o);
  }

  function hasContent(): boolean {
    return (
      draft.name.trim().length > 0 ||
      draft.background.trim().length > 0 ||
      draft.goals.length > 0 ||
      draft.nonGoals.length > 0 ||
      draft.techStack.length > 0
    );
  }

  function canNext(): boolean {
    if (step === 1) return draft.name.trim().length > 0;
    if (step === 2) return draft.background.trim().length > 0;
    return true; // 3 / 4 都可选
  }

  async function handleSubmit() {
    if (!canNext()) {
      toast.error("请先填必填项");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: draft.name.trim(),
          background: draft.background.trim(),
          goals: draft.goals,
          nonGoals: draft.nonGoals,
          techStack: draft.techStack,
        }),
      });
      const data = await r.json();
      if (!data.ok) {
        toast.error(data.error ?? "创建失败");
        return;
      }
      toast.success("项目已创建");
      onCreated(data.workspace);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`网络错误: ${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-xl"
        onOpenAutoFocus={(e) => {
          // 自己抢焦点
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            新建项目
          </DialogTitle>
          <DialogDescription>
            4 步走完即创建。背景必填,其他都可空。
          </DialogDescription>
        </DialogHeader>

        {/* 步骤指示器 */}
        <Stepper current={step} onJump={(s) => setStep(s)} />

        {/* 步骤内容 */}
        <div className="min-h-[260px] py-2">
          {step === 1 && <Step1 draft={draft} setDraft={setDraft} />}
          {step === 2 && <Step2 draft={draft} setDraft={setDraft} />}
          {step === 3 && (
            <Step3
              draft={draft}
              setDraft={setDraft}
              goalInput={goalInput}
              setGoalInput={setGoalInput}
              nonGoalInput={nonGoalInput}
              setNonGoalInput={setNonGoalInput}
            />
          )}
          {step === 4 && (
            <Step4
              draft={draft}
              setDraft={setDraft}
              techInput={techInput}
              setTechInput={setTechInput}
            />
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (step > 1 ? setStep((step - 1) as Step) : handleOpenChange(false))}
            disabled={submitting}
          >
            {step > 1 ? (
              <>
                <ArrowLeft className="h-3 w-3 mr-1" /> 上一步
              </>
            ) : (
              "取消"
            )}
          </Button>
          {step < 4 ? (
            <Button
              size="sm"
              disabled={!canNext() || submitting}
              onClick={() => setStep((step + 1) as Step)}
            >
              下一步 <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !canNext()}>
              {submitting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> 创建中…
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 mr-1" /> 创建项目
                </>
              )}
            </Button>
          )}
        </div>

        {/* 关闭二次确认 */}
        {confirmClose && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
            <div className="rounded-md border bg-white p-4 shadow-lg max-w-xs space-y-3">
              <p className="text-sm font-medium">确认放弃已填内容?</p>
              <p className="text-xs text-muted-foreground">
                已经填了 {draft.name || "项目名"} 等信息,关掉会丢。
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmClose(false)}
                >
                  继续填
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    reset();
                    setConfirmClose(false);
                    onOpenChange(false);
                  }}
                >
                  放弃
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── 步骤指示器 ── */
function Stepper({
  current,
  onJump,
}: {
  current: Step;
  onJump: (s: Step) => void;
}) {
  return (
    <div className="flex items-center gap-1 py-2">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isActive = s.n === current;
        const isDone = s.n < current;
        return (
          <div key={s.n} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => onJump(s.n)}
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md transition-colors",
                isActive
                  ? "bg-blue-100 text-blue-700"
                  : isDone
                  ? "text-emerald-600 hover:bg-emerald-50"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  isActive
                    ? "bg-blue-500 text-white"
                    : isDone
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 text-slate-600"
                )}
              >
                {isDone ? <Check className="h-2.5 w-2.5" /> : s.n}
              </span>
              <Icon className="h-3 w-3" />
              <span className="hidden sm:inline">{s.title}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-1 rounded-full",
                  isDone ? "bg-emerald-300" : "bg-slate-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 1: 项目名 ── */
function Step1({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">项目名 *</Label>
      <Input
        autoFocus
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.name.trim()) {
            e.preventDefault();
          }
        }}
        placeholder="例:kanban / 我的项目 / Q3 看板迭代"
        className="h-9 text-sm"
        maxLength={200}
      />
      <p className="text-[10px] text-muted-foreground">
        简短好记。3 人共享一个项目名,改的话不会影响别人(即时同步)。
      </p>
    </div>
  );
}

/* ── Step 2: 背景 ── */
function Step2({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">项目背景 *</Label>
      <Textarea
        autoFocus
        value={draft.background}
        onChange={(e) => setDraft({ ...draft, background: e.target.value })}
        placeholder="例:3 人小队的多人协作平台,支持任务看板 + 协作文档 + 接口 mock。当前迭代 v2.0,主打 API mock 和多人编辑。"
        rows={6}
        className="text-sm resize-none"
        maxLength={5000}
      />
      <p className="text-[10px] text-muted-foreground">
        {draft.background.length} / 5000 · 团队对齐 + AI 生成 spec 时的 context 都靠这个
      </p>
    </div>
  );
}

/* ── Step 3: 目标 / 非目标 ── */
function Step3({
  draft,
  setDraft,
  goalInput,
  setGoalInput,
  nonGoalInput,
  setNonGoalInput,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  goalInput: string;
  setGoalInput: (s: string) => void;
  nonGoalInput: string;
  setNonGoalInput: (s: string) => void;
}) {
  function addToList(
    list: string[],
    v: string,
    setInput: (s: string) => void
  ): string[] {
    const x = v.trim();
    if (!x) return list;
    if (list.includes(x)) {
      toast.info("已经存在了");
      return list;
    }
    setInput("");
    return [...list, x];
  }

  return (
    <div className="space-y-4">
      {/* 目标 */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-1">
          <Target className="h-3 w-3 text-emerald-600" /> 项目目标
        </Label>
        <div className="space-y-1 rounded-md border bg-slate-50/50 p-2 min-h-[40px]">
          {draft.goals.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic">还没添加</div>
          ) : (
            draft.goals.map((g) => (
              <div
                key={g}
                className="flex items-center gap-1.5 text-xs bg-white rounded border px-2 py-1"
              >
                <span className="flex-1 break-words">{g}</span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, goals: draft.goals.filter((x) => x !== g) })
                  }
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
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setDraft({
                  ...draft,
                  goals: addToList(draft.goals, goalInput, setGoalInput),
                });
              }
            }}
            placeholder="回车添加(例:支持 3 人实时协作)"
            className="h-7 text-xs"
            maxLength={500}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() =>
              setDraft({
                ...draft,
                goals: addToList(draft.goals, goalInput, setGoalInput),
              })
            }
            disabled={!goalInput.trim()}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* 非目标 */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-1">
          <Ban className="h-3 w-3 text-rose-600" /> 明确不做
        </Label>
        <div className="space-y-1 rounded-md border bg-slate-50/50 p-2 min-h-[40px]">
          {draft.nonGoals.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic">还没添加</div>
          ) : (
            draft.nonGoals.map((g) => (
              <div
                key={g}
                className="flex items-center gap-1.5 text-xs bg-white rounded border px-2 py-1"
              >
                <span className="flex-1 break-words">{g}</span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      nonGoals: draft.nonGoals.filter((x) => x !== g),
                    })
                  }
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
            value={nonGoalInput}
            onChange={(e) => setNonGoalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setDraft({
                  ...draft,
                  nonGoals: addToList(draft.nonGoals, nonGoalInput, setNonGoalInput),
                });
              }
            }}
            placeholder="回车添加(例:不做权限系统)"
            className="h-7 text-xs"
            maxLength={500}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() =>
              setDraft({
                ...draft,
                nonGoals: addToList(draft.nonGoals, nonGoalInput, setNonGoalInput),
              })
            }
            disabled={!nonGoalInput.trim()}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        目标让团队聚焦;非目标防止 scope creep。AI 提示时也会参考这两栏。
      </p>
    </div>
  );
}

/* ── Step 4: 技术栈 ── */
function Step4({
  draft,
  setDraft,
  techInput,
  setTechInput,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  techInput: string;
  setTechInput: (s: string) => void;
}) {
  /**
   * Step 4 — 技术栈(分前端 / 后端 / 通用 3 桶)
   *
   * 每列独立 input + 独立 state(避免"全局 input 没法分类"的问题)
   * 父组件传入的 techInput 还兼容着(为了不破坏现有 API),但实际渲染里
   * 我们用本地 state 接管。
   */
  const [techInputF, setTechInputF] = useState("");
  const [techInputB, setTechInputB] = useState("");
  // 同步到父组件(父组件 reset 时清空)
  useEffect(() => {
    if (techInput === "" && techInputF !== "") setTechInputF("");
    if (techInput === "" && techInputB !== "") setTechInputB("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techInput]);

  /**
   * 数据:扁平 string[],每条带前缀 [F]/[B]/[T] (跟 TechKind 对应)
   *   - 选推荐时自动加前缀
   *   - 用户手输时如果没前缀,默认 [F](前端)
   * 渲染:3 列(前/后/通用),每列显示该分类的已选 + 还能加的推荐
   */
  function addToList(
    v: string,
    kind: TechKind = "frontend",
    clearInput: () => void
  ): string[] {
    const tagged = makeTechTag(v, kind);
    if (!tagged) return draft.techStack;
    if (draft.techStack.includes(tagged)) {
      toast.info("已经存在了");
      return draft.techStack;
    }
    clearInput();
    return [...draft.techStack, tagged];
  }

  const columns: Array<{
    kind: Exclude<TechKind, "tool" | "unknown">;
    title: string;
    borderClass: string;
    bgClass: string;
    textClass: string;
    presetKey: keyof typeof TECH_STACK_SUGGESTIONS;
    /** 该列自己的 input state setter */
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

  // "未分类" 桶:用户手输但没打 [F]/[B]/[T] 前缀,或者打了 [T]
  const taggedByKind: Record<TechKind, string[]> = {
    frontend: [],
    backend: [],
    tool: [],
    unknown: [],
  };
  for (const t of draft.techStack) {
    const { kind } = parseTechTag(t);
    taggedByKind[kind].push(t);
  }

  return (
    <div className="space-y-3">
      <Label className="text-xs font-medium">技术栈(分前端 / 后端,任意加)</Label>

      <div className="grid grid-cols-2 gap-3">
        {columns.map((col) => {
          const items = taggedByKind[col.kind];
          const presets = TECH_STACK_SUGGESTIONS[col.presetKey].filter(
            (p) => !draft.techStack.includes(makeTechTag(p, col.kind))
          );
          return (
            <div
              key={col.kind}
              className={`rounded-md border ${col.borderClass} ${col.bgClass} p-2 space-y-1.5`}
            >
              <div className={`text-[11px] font-semibold ${col.textClass}`}>
                {col.title}{" "}
                <span className="text-[10px] font-normal text-muted-foreground">
                  ({items.length})
                </span>
              </div>
              {/* 已选 */}
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
                          setDraft({
                            ...draft,
                            techStack: draft.techStack.filter((x) => x !== t),
                          })
                        }
                        className="ml-0.5 hover:text-rose-600"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
              {/* 每列自己的输入框 — 在哪列输就归哪类(避开了"全局 input 没法分类"的问题) */}
              <div className="flex gap-1">
                <Input
                  value={col.input}
                  onChange={(e) => col.setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setDraft({
                        ...draft,
                        techStack: addToList(col.input, col.kind, () => col.setInput("")),
                      });
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
                  onClick={() =>
                    setDraft({
                      ...draft,
                      techStack: addToList(col.input, col.kind, () => col.setInput("")),
                    })
                  }
                  disabled={!col.input.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {/* 推荐 */}
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {presets.slice(0, 6).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          techStack: addToList(p, col.kind, () => col.setInput("")),
                        })
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

      {/* "通用" 桶:用户手打了 [T] 前缀的(可视化,跟前后端平级) */}
      {taggedByKind.tool.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50/50 p-2">
          <div className="text-[11px] font-semibold text-amber-700 mb-1">
            通用工具({taggedByKind.tool.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {taggedByKind.tool.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[10px] font-medium"
              >
                {parseTechTag(t).name}
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      techStack: draft.techStack.filter((x) => x !== t),
                    })
                  }
                  className="ml-0.5 hover:text-rose-600"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
