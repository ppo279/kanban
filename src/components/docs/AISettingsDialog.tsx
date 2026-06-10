"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  FlaskConical,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  setAPIKey,
  getAPIKey,
  hasAPIKey,
  clearAPIKey,
  wrapApiKey,
  resetAIPubkeyCache,
} from "@/lib/ai-keys";
import { resolveModel, AI_PROVIDER_CONFIG } from "@/lib/aiProviders";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 设置完后通知父组件(触发刷新 key 状态等) */
  onConfigured?: () => void;
}

/** 测试状态 — 用 union 而不是 boolean,带详情 */
type TestStatus =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; message: string; model: string }
  | { state: "fail"; message: string };

/**
 * AI API Key 配置弹窗
 * - 选 provider
 * - 输明文 key(保存时 AES-GCM 加密存 localStorage)
 * - 显示"已配置"状态(已配过的 provider 显示"已配置 / 清除"按钮)
 */
export function AISettingsDialog({ open, onOpenChange, onConfigured }: Props) {
  const [provider, setProvider] = useState<AIProvider>("deepseek");
  const [keyValue, setKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState<Record<AIProvider, boolean>>({
    minimax: false,
    deepseek: false,
  });
  // 每个 provider 独立的测试状态
  const [testStatus, setTestStatus] = useState<
    Record<AIProvider, TestStatus>
  >({
    minimax: { state: "idle" },
    deepseek: { state: "idle" },
  });
  // 清除 key 的二次确认 — null = 不弹
  const [clearTarget, setClearTarget] = useState<AIProvider | null>(null);

  // 每次打开时刷新"已配置"状态 + 重置测试状态
  useEffect(() => {
    if (!open) return;
    setConfigured({
      minimax: hasAPIKey("minimax"),
      deepseek: hasAPIKey("deepseek"),
    });
    setTestStatus({ minimax: { state: "idle" }, deepseek: { state: "idle" } });
    // 切到第一个未配置的 provider
    if (!hasAPIKey("deepseek")) setProvider("deepseek");
    else if (!hasAPIKey("minimax")) setProvider("minimax");
    setKeyValue("");
    setShowKey(false);
  }, [open]);

  // 测试某个 provider 的 key 是否有效
  async function handleTest(p: AIProvider) {
    setTestStatus((s) => ({ ...s, [p]: { state: "testing" } }));
    try {
      const apiKey = await getAPIKey(p);
      if (!apiKey) {
        setTestStatus((s) => ({
          ...s,
          [p]: { state: "fail", message: "Key 读取失败(可能浏览器数据被清)" },
        }));
        return;
      }
      // AAD 用 provider 默认 model,跟 BE 端 resolveModel 保持一致
      const testModel = resolveModel(p);
      const enc = await wrapApiKey(apiKey, {
        provider: p,
        model: testModel,
        mode: "test",
        title: "ping",
        prompt: "",
      });
      const r = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: p, enc, model: testModel }),
      });
      const data = await r.json();
      // kid 失效 → 重试一次
      if (r.status === 401 && String(data.error ?? "").includes("公钥已过期")) {
        resetAIPubkeyCache();
        const enc2 = await wrapApiKey(apiKey, {
          provider: p,
          model: testModel,
          mode: "test",
          title: "ping",
          prompt: "",
        });
        const r2 = await fetch("/api/ai/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ provider: p, enc: enc2, model: testModel }),
        });
        const data2 = await r2.json();
        applyTestResult(p, data2);
        return;
      }
      applyTestResult(p, data);
    } catch (e: any) {
      setTestStatus((s) => ({
        ...s,
        [p]: { state: "fail", message: e?.message ?? String(e) },
      }));
      toast.error(`测试失败:${e?.message ?? e}`);
    }
  }

  function applyTestResult(
    p: AIProvider,
    data: { ok: boolean; message?: string; model?: string; error?: string }
  ) {
    if (data.ok) {
      setTestStatus((s) => ({
        ...s,
        [p]: { state: "ok", message: data.message ?? "OK", model: data.model ?? "" },
      }));
      toast.success(`${AI_PROVIDERS.find((x) => x.id === p)?.label} 连接成功`);
    } else {
      setTestStatus((s) => ({
        ...s,
        [p]: { state: "fail", message: data.error ?? "未知错误" },
      }));
      toast.error(`测试失败:${data.error ?? "未知错误"}`);
    }
  }

  async function handleSave() {
    if (!keyValue.trim()) {
      toast.error("请输入 API key");
      return;
    }
    setSaving(true);
    try {
      await setAPIKey(provider, keyValue.trim());
      toast.success(`${AI_PROVIDERS.find((p) => p.id === provider)?.label} key 已保存(浏览器本地加密)`);
      setConfigured((c) => ({ ...c, [provider]: true }));
      setKeyValue("");
      onConfigured?.();
      // 保存成功 → 自动关闭 dialog
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`保存失败:${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  function handleClear(p: AIProvider) {
    setClearTarget(p);
  }

  function doClear() {
    if (!clearTarget) return;
    const p = clearTarget;
    clearAPIKey(p);
    setConfigured((c) => ({ ...c, [p]: false }));
    setTestStatus((s) => ({ ...s, [p]: { state: "idle" } }));
    toast.success("已清除");
    onConfigured?.();
    setClearTarget(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            AI API Key 配置
          </DialogTitle>
          <DialogDescription>
            Key 加密后存在你的浏览器里(本机可读,别人拿不到)。
            <span className="inline-flex items-center gap-1 ml-1 text-emerald-600">
              <ShieldCheck className="h-3 w-3" />
              AES-GCM 256
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Provider 选择 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">服务商</Label>
            <div className="grid grid-cols-2 gap-2">
              {AI_PROVIDERS.map((p) => {
                const isConfigured = configured[p.id];
                const isSelected = provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvider(p.id)}
                    className={`flex flex-col items-start text-left rounded-md border-2 p-2.5 transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-semibold">{p.label}</span>
                      {isConfigured ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          已配置
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          未配置
                        </span>
                      )}
                    </div>
                    <a
                      href={p.helpUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5 mt-1"
                    >
                      获取 key
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Key 输入 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {AI_PROVIDERS.find((p) => p.id === provider)?.label} API Key
            </Label>
            <div className="flex gap-1">
              <Input
                type={showKey ? "text" : "password"}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={AI_PROVIDERS.find((p) => p.id === provider)?.placeholder}
                className="h-9 text-xs font-mono"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? "隐藏" : "显示"}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              保存后会立即加密,原文不会留在 localStorage。
            </p>
          </div>

          {/* 已配置的 provider:测试 + 清除 */}
          {(configured.minimax || configured.deepseek) && (
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs text-muted-foreground">
                已配置的 key · 可点 [测试] 验证是否可用
              </Label>
              {AI_PROVIDERS.filter((p) => configured[p.id]).map((p) => {
                const status = testStatus[p.id];
                return (
                  <div
                    key={p.id}
                    className="space-y-1 px-2 py-1.5 rounded bg-slate-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{p.label}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px]"
                          disabled={status.state === "testing"}
                          onClick={() => handleTest(p.id)}
                          title="调一次最小请求,验证 key 有效"
                        >
                          {status.state === "testing" ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <FlaskConical className="h-3 w-3 mr-1" />
                          )}
                          测试
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-muted-foreground hover:text-red-600"
                          onClick={() => handleClear(p.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          清除
                        </Button>
                      </div>
                    </div>
                    {/* 测试结果展示 */}
                    {status.state === "ok" && (
                      <div className="flex items-start gap-1 text-[10px] text-emerald-700">
                        <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="break-all">{status.message}</span>
                      </div>
                    )}
                    {status.state === "fail" && (
                      <div className="flex items-start gap-1 text-[10px] text-rose-700">
                        <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="break-all">{status.message}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !keyValue.trim()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* ── 清除 key 的二次确认(替代 window.confirm) ── */}
      <Dialog
        open={clearTarget !== null}
        onOpenChange={(o) => !o && setClearTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-4 w-4" />
              清除 API Key
            </DialogTitle>
            <DialogDescription>
              确认要清除这个 key 吗?清除后调用 AI 时需要重新配置。
            </DialogDescription>
          </DialogHeader>
          {clearTarget && (
            <div className="rounded-md border border-rose-200 bg-rose-50/50 p-2.5 text-sm">
              <div className="font-medium">
                {AI_PROVIDERS.find((x) => x.id === clearTarget)?.label}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Key 已加密存在浏览器,清除后不可恢复(需要重新填)。
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setClearTarget(null)}
              autoFocus
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={doClear}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              确认清除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
