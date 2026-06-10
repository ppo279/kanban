"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Settings,
  Tag as TagIcon,
  Plus,
  X,
  Loader2,
  Target,
  Ban,
  Code2,
  FileText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/util";
import {
  TECH_STACK_SUGGESTIONS,
  type ProjectSettings,
} from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 修改后回调(让父组件可刷新缓存的 settings) */
  onSaved?: (s: ProjectSettings) => void;
}

/** 项目设置弹窗(单例)
 *  - 名字、背景(自由文本)
 *  - 目标 / 非目标(结构化 string[],可增删)
 *  - 技术栈(多标签,带 quick-add 推荐列表)
 *  - 任意登录用户都能改(3 人平等)
 */
export function ProjectSettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("kanban");
  const [background, setBackground] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [nonGoals, setNonGoals] = useState<string[]>([]);
  const [techStack, setTechStack] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [goalInput, setGoalInput] = useState("");
  const [nonGoalInput, setNonGoalInput] = useState("");
  const [techInput, setTechInput] = useState("");

  // 打开时拉最新
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/project-settings", { credentials: "include" });
      const data = await r.json();
      if (!data.ok) {
        toast.error(data.error ?? "加载失败");
        return;
      }
      const s: ProjectSettings = data.settings;
      setName(s.name);
      setBackground(s.background ?? "");
      setGoals(s.goals);
      setNonGoals(s.nonGoals);
      setTechStack(s.techStack);
      setUpdatedAt(s.updatedAt);
    } catch (e: any) {
      toast.error(`网络错误: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function addToList(
    list: string[],
    setList: (xs: string[]) => void,
    value: string,
    setInput: (s: string) => void
  ) {
    const v = value.trim();
    if (!v) return;
    if (list.includes(v)) {
      toast.info("已经存在了");
      return;
    }
    setList([...list, v]);
    setInput("");
  }

  function removeFromList(
    list: string[],
    setList: (xs: string[]) => void,
    value: string
  ) {
    setList(list.filter((x) => x !== value));
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("项目名不能为空");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/project-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          background: background.trim() || null,
          goals,
          nonGoals,
          techStack,
        }),
      });
      const data = await r.json();
      if (!data.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      toast.success("项目设置已更新");
      onSaved?.(data.settings);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`网络错误: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  // 快速 add 的技术栈推荐(过滤掉已选的)
  const techSuggestions = TECH_STACK_SUGGESTIONS.filter(
    (t) => !techStack.includes(t)
  ).slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            项目设置
          </DialogTitle>
          <DialogDescription>
            配置项目名、背景、目标 / 非目标、技术栈。任意成员都能改(3 人平等)。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : (
          <div className="space-y-5">
            {/* 项目名 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1">
                <FileText className="h-3 w-3" />
                项目名
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例:kanban / 我的项目"
                className="h-9 text-sm"
                maxLength={200}
              />
            </div>

            {/* 项目背景 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">项目背景</Label>
              <Textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="例:3 人小队的多人协作平台,支持任务看板 + 协作文档 + 接口 mock。"
                rows={3}
                className="text-sm resize-none"
                maxLength={5000}
              />
              <p className="text-[10px] text-muted-foreground">
                自由文本。可写产品定位、目标用户、当前阶段。
              </p>
            </div>

            {/* 目标 */}
            <StringListEditor
              icon={<Target className="h-3 w-3" />}
              label="项目目标"
              hint="清晰的目标有助于团队对齐(也是后续 AI 提示的好素材)"
              items={goals}
              inputValue={goalInput}
              setInputValue={setGoalInput}
              onAdd={() => addToList(goals, setGoals, goalInput, setGoalInput)}
              onRemove={(v) => removeFromList(goals, setGoals, v)}
              colorClass="text-emerald-600"
              placeholder="例:支持 3 人实时协作编辑文档"
            />

            {/* 非目标 */}
            <StringListEditor
              icon={<Ban className="h-3 w-3" />}
              label="明确不做"
              hint="防止 scope creep;AI 提示时也告诉它别越界"
              items={nonGoals}
              inputValue={nonGoalInput}
              setInputValue={setNonGoalInput}
              onAdd={() =>
                addToList(nonGoals, setNonGoals, nonGoalInput, setNonGoalInput)
              }
              onRemove={(v) => removeFromList(nonGoals, setNonGoals, v)}
              colorClass="text-rose-600"
              placeholder="例:不做权限系统 / 不做邮件通知"
            />

            {/* 技术栈 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Code2 className="h-3 w-3" />
                技术栈
              </Label>

              {/* 已选标签 */}
              <div className="flex flex-wrap gap-1.5 min-h-[32px] rounded-md border bg-slate-50/50 p-2">
                {techStack.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground italic">
                    还没选标签,从下方点或自己输
                  </span>
                ) : (
                  techStack.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 text-[10px] font-medium"
                    >
                      <TagIcon className="h-2.5 w-2.5" />
                      {t}
                      <button
                        type="button"
                        onClick={() => removeFromList(techStack, setTechStack, t)}
                        className="ml-0.5 hover:text-rose-600"
                        title="移除"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* 手动输入 */}
              <div className="flex gap-1">
                <Input
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToList(techStack, setTechStack, techInput, setTechInput);
                    }
                  }}
                  placeholder="输入后回车添加(任意标签)"
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() =>
                    addToList(techStack, setTechStack, techInput, setTechInput)
                  }
                  disabled={!techInput.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {/* quick add 推荐 */}
              {techSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <span className="text-[10px] text-muted-foreground mr-1 self-center">
                    推荐:
                  </span>
                  {techSuggestions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addToList(techStack, setTechStack, t, setTechInput)}
                      className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:border-blue-300 hover:text-blue-700 transition-colors"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* updated 元信息 */}
            {updatedAt && (
              <p className="text-[10px] text-muted-foreground">
                最后更新: {new Date(updatedAt).toLocaleString("zh-CN")}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                保存中…
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── 通用 string[] 编辑器(目标 / 非目标 共用) ── */
function StringListEditor({
  icon,
  label,
  hint,
  items,
  inputValue,
  setInputValue,
  onAdd,
  onRemove,
  colorClass,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  items: string[];
  inputValue: string;
  setInputValue: (s: string) => void;
  onAdd: () => void;
  onRemove: (v: string) => void;
  colorClass: string;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium flex items-center gap-1">
        <span className={cn(colorClass)}>{icon}</span>
        {label}
      </Label>

      {/* 已加项 */}
      <div className="space-y-1 rounded-md border bg-slate-50/50 p-2 min-h-[32px]">
        {items.length === 0 ? (
          <div className="text-[10px] text-muted-foreground italic">
            还没添加,从下面输入
          </div>
        ) : (
          items.map((it) => (
            <div
              key={it}
              className="flex items-center gap-1.5 text-xs bg-white rounded border px-2 py-1"
            >
              <span className="flex-1 break-words">{it}</span>
              <button
                type="button"
                onClick={() => onRemove(it)}
                className="text-muted-foreground hover:text-rose-500 shrink-0"
                title="删除"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 输入 + add */}
      <div className="flex gap-1">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder}
          className="h-8 text-xs"
          maxLength={500}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={onAdd}
          disabled={!inputValue.trim()}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}
