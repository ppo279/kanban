"use client";

// AI 抽屉 — 协作文档编辑器内嵌的 AI 写作助手
//
// 设计:
// - 右侧抽屉,常驻可折叠。DocPanel 在 editing Dialog 渲染时挂上,open=true 时展开
// - 顶部:Provider/Model 选择 + 关闭按钮
// - 中部:需求/背景 textarea + 文档标题(自动从上下文取,可手动改)
// - 中-下:生成结果区(实时 markdown 预览,react-markdown 渲染)
//   阶段 4 会切流式:token-by-token 累加,中断按钮出现
// - 底部:操作按钮 — 插入到光标 / 替换全文 / 重新生成 / 取消
//
// 数据流:
// - 父组件 DocPanel 持有 aiDrawerOpen / aiGenerating / aiGeneratedMarkdown 状态
// - 抽屉本身几乎无状态,只托管表单字段(provider/model/prompt/result)
// - 生成请求走 /api/ai/generate(复用现有信封 + 401 重试机制)
//
// 与老 AIGenerateDialog 的区别:
// - 老的是 modal,生成完就关,内容根本到不了 doc
// - 新的常驻,内容直接 setContent 到编辑器,所见即所得

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  X,
  Loader2,
  Key,
  Send,
  RotateCcw,
  Replace,
  ArrowDownToLine,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";
import {
  AI_PROVIDERS,
  hasAPIKey,
  getAPIKey,
  wrapApiKeyWithRetry,
  resetAIPubkeyCache,
  type AIProvider,
} from "@/lib/ai-keys";
import { AI_PROVIDER_CONFIG } from "@/lib/aiProviders";
import type { DocMode } from "@/types";

/** 走共享 aiProviders 配置,跟 BE 默认 model 保持同步 */
const MODEL_OPTIONS: Record<AIProvider, Array<{ id: string; label: string }>> = {
  minimax: AI_PROVIDER_CONFIG.minimax.modelOptions,
  deepseek: AI_PROVIDER_CONFIG.deepseek.modelOptions,
};

/** 调 /api/ai/suggest-title 拿 AI 起的标题 — 失败返回 null,主流程继续 */
async function suggestTitle(
  provider: AIProvider,
  model: string,
  context: string
): Promise<string | null> {
  const plainKey = await getAPIKey(provider);
  if (!plainKey) return null;
  const aad = {
    provider,
    model,
    mode: "title",
    title: "title-suggest",
    prompt: context,
  };
  let enc;
  try {
    enc = await wrapApiKeyWithRetry(plainKey, aad);
  } catch {
    return null;
  }
  const doRequest = async (envelope: typeof enc) =>
    fetch("/api/ai/suggest-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        provider,
        enc: envelope,
        model,
        context,
      }),
    });
  let r = await doRequest(enc);
  if (r.status === 401) {
    const errBody = await r.json().catch(() => ({}));
    if (String(errBody.error ?? "").includes("公钥已过期")) {
      resetAIPubkeyCache();
      const enc2 = await wrapApiKeyWithRetry(plainKey, aad);
      r = await doRequest(enc2);
    }
  }
  if (!r.ok) return null;
  const data = await r.json();
  return data.ok ? (data.title as string) : null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 当前文档模式(决定生成 spec 还是 tdd 骨架) */
  mode: DocMode;
  /** 当前文档标题(显示在结果预览顶部) */
  title: string;
  /** 是否正在生成 — 父组件需要用来 disable 编辑器保存按钮等 */
  onGeneratingChange?: (g: boolean) => void;
  /** AI 生成完的回调 — 父组件决定怎么注入(插入光标/替换全文) */
  onApply: (kind: "insert" | "replace", markdown: string) => void;
  /** 打开 AI key 设置 dialog(没配 key 时引导用户去配) */
  onRequestKeySetup: () => void;
}

export function AIDrawer({
  open,
  onOpenChange,
  mode,
  title,
  onGeneratingChange,
  onApply,
  onRequestKeySetup,
}: Props) {
  const [provider, setProvider] = useState<AIProvider>("deepseek");
  const [model, setModel] = useState<string>(MODEL_OPTIONS.deepseek[0].id);
  const [prompt, setPrompt] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [generating, setGenerating] = useState(false);
  /** 流式累积的 markdown(阶段 4 用,目前一次性写满) */
  const [streamed, setStreamed] = useState("");
  /** 阶段 4 中断用 */
  const abortRef = useRef<AbortController | null>(null);

  // 打开时检查 key、初始化默认值
  useEffect(() => {
    if (!open) return;
    if (hasAPIKey("minimax")) setProvider("minimax");
    else if (hasAPIKey("deepseek")) setProvider("deepseek");
    else setProvider("minimax");
    setPrompt("");
    // 已生成的内容保留(用户可能想再生成,prompt 重新写)
  }, [open]);

  // 切 provider 时同步 model 默认 + key 状态
  useEffect(() => {
    setHasKey(hasAPIKey(provider));
    setModel(MODEL_OPTIONS[provider][0].id);
  }, [provider, open]);

  // 把 generating 透传给父组件
  useEffect(() => {
    onGeneratingChange?.(generating);
  }, [generating, onGeneratingChange]);

  // 真正发请求 — 走原生 fetch(信封+401 重试)
  const doGenerate = useCallback(async () => {
    if (!hasKey) {
      toast.error(`还没配 ${provider} 的 API key`);
      onRequestKeySetup();
      return;
    }
    // 阶段 3:title 为空时,先让 LLM 顺便起一个(1-2s 额外等待)
    // 这样 AAD 里的 title 字段不是 "未命名",后端生成的内容也能呼应实际标题
    let finalTitle = title;
    if (!finalTitle && prompt.trim()) {
      try {
        const suggested = await suggestTitle(provider, model, prompt);
        if (suggested) {
          finalTitle = suggested;
          toast.info(`AI 建议标题:${suggested}`);
        }
      } catch (e: any) {
        // 起标题失败不阻塞主生成,fallback "未命名"
        // eslint-disable-next-line no-console
        console.warn("[AIDrawer] suggest-title failed:", e);
      }
    }
    setGenerating(true);
    setStreamed("");
    abortRef.current = new AbortController();
    try {
      const plainKey = await getAPIKey(provider);
      if (!plainKey) {
        toast.error(`没找到 ${provider} 的 API key`);
        setGenerating(false);
        return;
      }
      const aad = {
        provider,
        model,
        mode: mode === "tdd" ? "tdd" : "spec",
        title: finalTitle || "未命名",
        prompt,
      };
      const enc = await wrapApiKeyWithRetry(plainKey, aad);

      // 阶段 4:流式 — 读 SSE chunks
      // 阶段 3 之前都是一次性,等 generate 路由改完再用流式
      // 当前实现:用流式 chunk 累积,后端先支持 text/event-stream,
      //         如果后端还没改,fetch 会读 ReadableStream,旧版块数据会一次性
      //         走完,所以两种情况都兼容
      const doRequest = async (envelope: typeof enc) =>
        fetch("/api/ai/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          credentials: "include",
          body: JSON.stringify({
            provider,
            enc: envelope,
            model,
            title: aad.title,
            prompt,
            mode: aad.mode,
          }),
          signal: abortRef.current?.signal,
        });
      let r = await doRequest(enc);
      // 401 kid 失效 → 重试一次
      if (r.status === 401) {
        const errBody = await r.json().catch(() => ({}));
        if (String(errBody.error ?? "").includes("公钥已过期")) {
          resetAIPubkeyCache();
          const enc2 = await wrapApiKeyWithRetry(plainKey, aad);
          r = await doRequest(enc2);
        }
      }
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        let errMsg = `生成失败 (${r.status})`;
        try {
          const j = JSON.parse(errText);
          errMsg = j.error ?? errMsg;
        } catch {
          /* keep status */
        }
        toast.error(errMsg);
        return;
      }
      // 阶段 4:流式解析 SSE
      const contentType = r.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream") && r.body) {
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // SSE 格式: "data: {json}\n\n" 或 "data: [DONE]\n\n"
          for (const line of chunk.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") break;
            try {
              const j = JSON.parse(payload);
              if (j.error) {
                toast.error(j.error);
                return;
              }
              if (j.token) {
                acc += j.token;
                setStreamed(acc);
              }
              if (j.done) {
                setStreamed(j.content ?? acc);
                return;
              }
            } catch {
              // 非 JSON 行(可能是裸文本)— 当成 token 追加
              if (payload) {
                acc += payload;
                setStreamed(acc);
              }
            }
          }
        }
      } else {
        // 一次性响应(JSON)
        const data = await r.json();
        if (data.ok && data.content) {
          setStreamed(data.content);
        } else if (!data.ok) {
          toast.error(data.error ?? "生成失败");
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        toast.info("已停止生成");
      } else {
        toast.error(`生成失败: ${e?.message ?? e}`);
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }, [hasKey, provider, model, mode, title, prompt, onRequestKeySetup]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // 抽屉关闭时重置 streaming 状态
  useEffect(() => {
    if (!open) {
      setStreamed("");
    }
  }, [open]);

  if (!open) {
    // 完全不渲染,让右侧布局收起
    return null;
  }

  return (
    <div
      data-ai-drawer-root
      className="w-80 shrink-0 border-l bg-gradient-to-b from-amber-50/30 to-white flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-amber-50/50">
        <div className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
          <Sparkles className="h-4 w-4 text-amber-500" />
          AI 写作助手
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="p-1 rounded hover:bg-amber-100 text-amber-700"
          title="收起抽屉"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Provider + Model */}
      <div className="px-3 py-2 border-b space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">服务商</Label>
            <div className="flex gap-1">
              {AI_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={`flex-1 rounded border px-1.5 py-1 text-[10px] font-medium transition-colors ${
                    provider === p.id
                      ? "border-amber-500 bg-amber-100 text-amber-800"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {p.label}
                  {hasAPIKey(p.id) ? (
                    <span className="ml-1 text-emerald-500">●</span>
                  ) : (
                    <span className="ml-1 text-slate-300">○</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">模型</Label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-7 w-full rounded border px-1.5 text-[10px]"
            >
              {MODEL_OPTIONS[provider].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!hasKey && (
          <div className="flex items-center justify-between gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
            <div className="flex items-center gap-1">
              <Key className="h-3 w-3" />
              <span>还没配 {provider} 的 key</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-5 text-[10px] px-1.5"
              onClick={onRequestKeySetup}
            >
              去配
            </Button>
          </div>
        )}
      </div>

      {/* Prompt */}
      <div className="px-3 py-2 border-b space-y-1.5">
        <Label className="text-[10px]">
          需求/背景
          <span className="text-muted-foreground ml-1">(选填,写了质量好很多)</span>
        </Label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="text-xs resize-none"
          placeholder={
            mode === "spec"
              ? "例:用户列表接口,支持按姓名/邮箱搜索、分页、权限只读、需要导出 CSV"
              : "例:先写测试,再写最小实现,支持分页 + 权限过滤"
          }
          disabled={generating}
        />
        <div className="text-[10px] text-muted-foreground">
          文档模式:<span className="font-medium">{mode === "tdd" ? "TDD" : "Spec"}</span>
          {title && <span className="ml-2">· 标题:{title}</span>}
        </div>
      </div>

      {/* 生成按钮(中间分隔,放生成按钮和中断按钮) */}
      <div className="px-3 py-2 border-b flex gap-1.5">
        {generating ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs"
            onClick={stop}
          >
            <Square className="h-3 w-3 mr-1" />
            停止
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="flex-1 h-8 text-xs bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white"
            onClick={doGenerate}
            disabled={!hasKey}
          >
            <Send className="h-3 w-3 mr-1" />
            生成
          </Button>
        )}
        {streamed && !generating && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={doGenerate}
            title="用同样 prompt 重新生成"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* 结果区 */}
      <div className="flex-1 overflow-auto px-3 py-2 min-h-0">
        {generating && !streamed && (
          <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
            <span>AI 正在思考…</span>
            <span className="text-[10px]">(通常 10-30 秒)</span>
          </div>
        )}
        {(streamed || generating) && (
          <div className="space-y-2">
            <div className="text-[10px] text-muted-foreground flex items-center justify-between">
              <span>
                预览
                {generating && (
                  <Loader2 className="h-3 w-3 ml-1 inline animate-spin" />
                )}
              </span>
              <span className="text-[10px]">
                {streamed.length} 字
              </span>
            </div>
            <div
              className="prose prose-sm max-w-none rounded border bg-white p-2 text-xs overflow-auto"
              style={{ maxHeight: "calc(100vh - 420px)" }}
            >
              <ReactMarkdown>{streamed || "*(等待内容...)*"}</ReactMarkdown>
            </div>
          </div>
        )}
        {!generating && !streamed && (
          <div className="flex flex-col items-center justify-center h-full text-[11px] text-muted-foreground text-center px-2 gap-1">
            <Sparkles className="h-6 w-6 text-amber-300" />
            <div>填需求 → 点生成</div>
            <div className="text-[10px]">结果会出现在这里,你可以预览后再决定插入到光标还是替换全文</div>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      {streamed && !generating && (
        <div className="px-3 py-2 border-t bg-slate-50 flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs"
            onClick={() => onApply("insert", streamed)}
            title="在光标处插入这段内容(原有内容保留)"
          >
            <ArrowDownToLine className="h-3 w-3 mr-1" />
            插入光标
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs text-red-700 border-red-300 hover:bg-red-50"
            onClick={() => {
              if (
                window.confirm(
                  "确认要替换整篇文档吗?当前内容会被 AI 生成的内容覆盖(可在编辑器内 Undo)。"
                )
              ) {
                onApply("replace", streamed);
              }
            }}
            title="用 AI 内容替换整篇文档"
          >
            <Replace className="h-3 w-3 mr-1" />
            替换全文
          </Button>
        </div>
      )}
    </div>
  );
}
