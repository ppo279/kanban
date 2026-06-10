"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Key, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AI_PROVIDERS,
  type AIProvider,
  getAPIKey,
  hasAPIKey,
} from "@/lib/ai-keys";
import type { DocMode } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 当前选中的文档模式(决定生成 spec 还是 tdd 骨架) */
  mode: DocMode;
  /** 当前输入的标题(作为生成 prompt 的一部分) */
  title: string;
  /** 生成成功后回调(content 是 markdown 文本,新建时塞到 initialContent) */
  onGenerated: (content: string, provider: AIProvider, model: string) => void;
  /** 没配 key 时跳到设置 dialog */
  onRequestKeySetup: () => void;
}

const MODEL_OPTIONS: Record<AIProvider, Array<{ id: string; label: string }>> = {
  minimax: [
    { id: "MiniMax-Text-01", label: "MiniMax-Text-01(推荐)" },
    { id: "abab6.5s-chat", label: "abab6.5s-chat" },
    { id: "abab6.5g-chat", label: "abab6.5g-chat" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "deepseek-chat(推荐,便宜)" },
    { id: "deepseek-coder", label: "deepseek-coder(代码更强)" },
    { id: "deepseek-reasoner", label: "deepseek-reasoner(推理强)" },
  ],
};

/**
 * AI 生成 prompt 弹窗
 * - 选 provider(没配 key 提示去设置)
 * - 选 model
 * - 写需求/背景(可空)
 * - 点生成 → 调后端 → 拿到 markdown → 回调
 */
export function AIGenerateDialog({
  open,
  onOpenChange,
  mode,
  title,
  onGenerated,
  onRequestKeySetup,
}: Props) {
  const [provider, setProvider] = useState<AIProvider>("deepseek");
  const [model, setModel] = useState<string>(MODEL_OPTIONS.deepseek[0].id);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  // 打开时检查 key、初始化默认值
  useEffect(() => {
    if (!open) return;
    // 优先选**已配 key 的** provider — 避免 deepseek 没配 / minimax 配了 仍被错误地设成 deepseek
    if (hasAPIKey("minimax")) setProvider("minimax");
    else if (hasAPIKey("deepseek")) setProvider("deepseek");
    else setProvider("minimax"); // 都没配默认 minimax(国内可达)
    setPrompt("");
  }, [open]);

  // 切 provider 时检查 key 状态,更新 model 默认
  useEffect(() => {
    setHasKey(hasAPIKey(provider));
    setModel(MODEL_OPTIONS[provider][0].id);
  }, [provider, open]);

  async function handleGenerate() {
    if (!hasKey) {
      toast.error(`还没配 ${AI_PROVIDERS.find((p) => p.id === provider)?.label} 的 key`);
      return;
    }
    if (!title.trim()) {
      toast.error("请先填标题");
      return;
    }

    setGenerating(true);
    try {
      const apiKey = await getAPIKey(provider);
      if (!apiKey) {
        toast.error("Key 读取失败,请重新配");
        setHasKey(false);
        return;
      }
      const r = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider,
          apiKey,
          title: title.trim(),
          prompt: prompt.trim(),
          mode,
          model,
        }),
      });
      const data = await r.json();
      if (!data.ok) {
        toast.error(data.error ?? "生成失败");
        return;
      }
      toast.success(`已生成 ${data.content.length} 字`);
      onGenerated(data.content, provider, data.model);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`生成失败:${e?.message ?? e}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            AI 一键生成 {mode === "spec" ? "Spec" : "TDD"} 文档
          </DialogTitle>
          <DialogDescription>
            根据标题 + 你写的需求,自动产出完整的 {mode.toUpperCase()} 骨架(含 checklist)。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Provider + Model */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">服务商</Label>
              <div className="flex gap-1">
                {AI_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvider(p.id)}
                    className={`flex-1 rounded-md border-2 px-2 py-1.5 text-xs font-medium transition-all ${
                      provider === p.id
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {p.label}
                    {hasAPIKey(p.id) ? (
                      <span className="ml-1 text-[9px] text-emerald-600">●</span>
                    ) : (
                      <span className="ml-1 text-[9px] text-slate-400">○</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">模型</Label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex h-8 w-full rounded-md border px-2 text-xs"
              >
                {MODEL_OPTIONS[provider].map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Key 状态提示 */}
          {!hasKey && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" />
                <span>还没配 {AI_PROVIDERS.find((p) => p.id === provider)?.label} 的 API key</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 text-[10px]"
                onClick={onRequestKeySetup}
              >
                去配置
              </Button>
            </div>
          )}

          {/* 需求输入 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              需求/背景<span className="text-muted-foreground">(可选,但写了质量高很多)</span>
            </Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === "spec"
                  ? "例:用户列表接口,支持按姓名/邮箱搜索、分页(每页 20)、权限只读。需要导出 CSV。"
                  : "例:实现用户列表的 SQL 查询 + 分页 + 权限过滤,先写失败的测试再写实现。"
              }
              rows={4}
              className="text-xs resize-none"
              disabled={generating}
            />
          </div>

          {/* 标题预览 */}
          <div className="rounded-md bg-slate-50 border p-2.5 text-xs">
            <div className="text-muted-foreground text-[10px] mb-0.5">生成标题</div>
            <div className="font-medium truncate">{title || <span className="text-amber-600">请先填标题</span>}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={generating}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generating || !hasKey || !title.trim()}
          >
            {generating ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-1" />
                生成
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
